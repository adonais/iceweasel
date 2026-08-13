/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsUserIdleServiceGTK.h"

#include <gtk/gtk.h>
#ifdef MOZ_X11
#  include <X11/Xlib.h>
#  include <X11/Xutil.h>
#  include <gdk/gdkx.h>

#  include "X11UndefineNone.h"
#endif

#include "WidgetUtilsGtk.h"
#include "mozilla/Logging.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "nsITimer.h"
#include "prlink.h"

#ifdef MOZ_ENABLE_DBUS
#  include "AsyncDBus.h"
#endif

static mozilla::LazyLogModule sIdleLog("nsIUserIdleService");

using namespace mozilla;
using namespace mozilla::widget;

#ifdef MOZ_X11
typedef struct {
  Window window;               // Screen saver window
  int state;                   // ScreenSaver(Off,On,Disabled)
  int kind;                    // ScreenSaver(Blanked,Internal,External)
  unsigned long til_or_since;  // milliseconds since/til screensaver kicks in
  unsigned long idle;          // milliseconds idle
  unsigned long event_mask;    // event stuff
} XScreenSaverInfo;

typedef Bool (*_XScreenSaverQueryExtension_fn)(Display* dpy, int* event_base,
                                               int* error_base);
typedef XScreenSaverInfo* (*_XScreenSaverAllocInfo_fn)(void);
typedef void (*_XScreenSaverQueryInfo_fn)(Display* dpy, Drawable drw,
                                          XScreenSaverInfo* info);

class UserIdleServiceX11 : public UserIdleServiceImpl {
 public:
  bool PollIdleTime(uint32_t* aIdleTime) override {
    // Ask xscreensaver about idle time:
    *aIdleTime = 0;

    // We might not have a display (cf. in xpcshell)
    Display* dplay = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
    if (!dplay) {
      MOZ_LOG(sIdleLog, LogLevel::Warning, ("No display found!\n"));
      return false;
    }

    int event_base, error_base;
    if (mXSSQueryExtension(dplay, &event_base, &error_base)) {
      if (!mXssInfo) mXssInfo = mXSSAllocInfo();
      if (!mXssInfo) return false;
      mXSSQueryInfo(dplay, GDK_ROOT_WINDOW(), mXssInfo);
      *aIdleTime = mXssInfo->idle;
      MOZ_LOG(sIdleLog, LogLevel::Info,
              ("UserIdleServiceX11::PollIdleTime() %d\n", *aIdleTime));
      return true;
    }
    // If we get here, we couldn't get to XScreenSaver:
    MOZ_LOG(sIdleLog, LogLevel::Warning,
            ("XSSQueryExtension returned false!\n"));
    return false;
  }

  bool ProbeImplementation() override {
    MOZ_LOG(sIdleLog, LogLevel::Info,
            ("UserIdleServiceX11::UserIdleServiceX11()\n"));

    if (!mozilla::widget::GdkIsX11Display()) {
      return false;
    }

    // This will leak - See comments in ~UserIdleServiceX11().
    PRLibrary* xsslib = PR_LoadLibrary("libXss.so.1");
    if (!xsslib)  // ouch.
    {
      MOZ_LOG(sIdleLog, LogLevel::Warning, ("Failed to find libXss.so!\n"));
      return false;
    }

    mXSSQueryExtension = (_XScreenSaverQueryExtension_fn)PR_FindFunctionSymbol(
        xsslib, "XScreenSaverQueryExtension");
    mXSSAllocInfo = (_XScreenSaverAllocInfo_fn)PR_FindFunctionSymbol(
        xsslib, "XScreenSaverAllocInfo");
    mXSSQueryInfo = (_XScreenSaverQueryInfo_fn)PR_FindFunctionSymbol(
        xsslib, "XScreenSaverQueryInfo");

    if (!mXSSQueryExtension) {
      MOZ_LOG(sIdleLog, LogLevel::Warning,
              ("Failed to get XSSQueryExtension!\n"));
    }
    if (!mXSSAllocInfo) {
      MOZ_LOG(sIdleLog, LogLevel::Warning, ("Failed to get XSSAllocInfo!\n"));
    }
    if (!mXSSQueryInfo) {
      MOZ_LOG(sIdleLog, LogLevel::Warning, ("Failed to get XSSQueryInfo!\n"));
    }
    if (!mXSSQueryExtension || !mXSSAllocInfo || !mXSSQueryInfo) {
      // We're missing X11 symbols
      return false;
    }

    // UserIdleServiceX11 uses sync init, confirm it now.
    mUserIdleServiceGTK->AcceptServiceCallback();
    return true;
  }

  explicit UserIdleServiceX11(nsUserIdleServiceGTK* aUserIdleService)
      : UserIdleServiceImpl(aUserIdleService) {};

  ~UserIdleServiceX11() {
#  ifdef MOZ_X11
    if (mXssInfo) {
      XFree(mXssInfo);
    }
#  endif

// It is not safe to unload libXScrnSaver until each display is closed because
// the library registers callbacks through XESetCloseDisplay (Bug 397607).
// (Also the library and its functions are scoped for the file not the object.)
#  if 0
        if (xsslib) {
            PR_UnloadLibrary(xsslib);
            xsslib = nullptr;
        }
#  endif
  }

 private:
  XScreenSaverInfo* mXssInfo = nullptr;
  _XScreenSaverQueryExtension_fn mXSSQueryExtension = nullptr;
  _XScreenSaverAllocInfo_fn mXSSAllocInfo = nullptr;
  _XScreenSaverQueryInfo_fn mXSSQueryInfo = nullptr;
};
#endif

#ifdef MOZ_ENABLE_DBUS
class UserIdleServiceMutter : public UserIdleServiceImpl {
 public:
  bool PollIdleTime(uint32_t* aIdleTime) override {
    MOZ_LOG(sIdleLog, LogLevel::Info, ("PollIdleTime() request\n"));

    // We're not ready yet
    if (!mProxy) {
      return false;
    }

    // Check cache freshness
    if (!mCacheTimestamp.IsNull()) {
      TimeDuration elapsed = TimeStamp::Now() - mCacheTimestamp;

      if (elapsed < TimeDuration::FromMilliseconds(kCacheStaleMs)) {
        // Serve from cache, advanced by the elapsed time so the value stays
        // monotonic. A frozen value that lags the wall clock looks like a
        // return from idle to nsUserIdleService, which re-arms its timer in a
        // tight loop. A real poll corrects it within kCacheStaleMs.
        uint64_t advanced =
            uint64_t(mCachedIdleTime) + uint64_t(elapsed.ToMilliseconds());
        if (advanced > std::numeric_limits<uint32_t>::max()) {
          advanced = std::numeric_limits<uint32_t>::max();
        }
        *aIdleTime = static_cast<uint32_t>(advanced);

        if (elapsed < TimeDuration::FromMilliseconds(kCacheFreshMs)) {
          MOZ_LOG(sIdleLog, LogLevel::Info,
                  ("PollIdleTime() returns cached (fresh) %d\n", *aIdleTime));
        } else {
          // Cache is acceptable but getting stale: kick off a background
          // refresh while returning the advanced cached value.
          MOZ_LOG(sIdleLog, LogLevel::Info,
                  ("PollIdleTime() returns cached (stale) %d, refreshing\n",
                   *aIdleTime));
          if (!mPollRequest.Exists()) {
            StartAsyncPoll();
          }
        }
        return true;
      }
      // Cache is very stale, fall through to synchronous wait
    }

    // Cache is null or older than kCacheStaleMs. Wait for a fresh value.
    // If a poll is already in flight — a stale-cache background refresh, or
    // an outer wait we re-entered via SpinEventLoopUntil event processing —
    // we just wait for it. StartAsyncPoll arms a one-shot timer that bounds
    // the wait regardless of main-thread activity.
    TimeStamp prevCacheTimestamp = mCacheTimestamp;
    if (!mPollRequest.Exists()) {
      StartAsyncPoll();
    }

    // Wait synchronously for the async DBus call to complete.
    // Note: We could make the entire GetIdleTime API async to avoid this.
    // However that involves quite a lot of callers and it is only really
    // useful when on GTK/DBUS. Live-lock is bounded by the poll timer (which
    // cancels the DBus call) and by the shutdown check below.
    MOZ_LOG(sIdleLog, LogLevel::Info,
            ("PollIdleTime() waiting for fresh value\n"));
    SpinEventLoopUntil("UserIdleServiceMutter::PollIdleTime"_ns, [&]() {
      return !mPollRequest.Exists() ||
             AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed);
    });

    if (mCacheTimestamp == prevCacheTimestamp) {
      MOZ_LOG(sIdleLog, LogLevel::Info,
              ("PollIdleTime() returning failure (timeout, async error, or "
               "shutdown)\n"));
      return false;
    }

    *aIdleTime = mCachedIdleTime;
    MOZ_LOG(sIdleLog, LogLevel::Info,
            ("PollIdleTime() returns fresh %d\n", *aIdleTime));
    return true;
  }

 private:
  // Cancels a one-shot timer and drops our reference to it, after which it is
  // safe to tear down state its callback captures (including destroying this).
  static void CancelTimer(nsCOMPtr<nsITimer>& aTimer) {
    if (aTimer) {
      // Guaranteed not to run afterwards even if the timer already fired and
      // its event is queued: nsTimerEvent re-checks the generation at Run()
      // time and drops a cancelled one.
      aTimer->Cancel();
      aTimer = nullptr;
    }
  }

  void StartAsyncPoll() {
    mPollRequest.DisconnectIfExists();
    // A fresh cancellable per request so the timer can cancel without
    // disturbing later requests, and so the timer callback holds the exact
    // cancellable that belongs to this in-flight call.
    mCancellable = dont_AddRef(g_cancellable_new());
    CancelTimer(mPollTimer);
    // The timer fires on the main thread: it cancels the in-flight DBus call
    // and disconnects the request so the spin in PollIdleTime exits and a
    // later call can start a fresh one. Capturing this is safe: the timer is
    // a member cancelled in the destructor.
    NS_NewTimerWithCallback(
        getter_AddRefs(mPollTimer),
        [this](nsITimer*) {
          MOZ_LOG(sIdleLog, LogLevel::Warning, ("PollIdleTime() timed out\n"));
          g_cancellable_cancel(mCancellable);
          mPollRequest.DisconnectIfExists();
        },
        TimeDuration::FromMilliseconds(kPollTimeoutMs), nsITimer::TYPE_ONE_SHOT,
        "UserIdleServiceMutter::PollIdleTime"_ns);

    DBusProxyCall(mProxy, "GetIdletime", nullptr, G_DBUS_CALL_FLAGS_NONE, -1,
                  mCancellable)
        ->Then(
            GetCurrentSerialEventTarget(), __func__,
            [this](RefPtr<GVariant>&& aResult) {
              mPollRequest.Complete();
              CancelTimer(mPollTimer);
              if (!g_variant_is_of_type(aResult, G_VARIANT_TYPE_TUPLE) ||
                  g_variant_n_children(aResult) != 1) {
                MOZ_LOG(sIdleLog, LogLevel::Info,
                        ("PollIdleTime() Unexpected params type: %s\n",
                         g_variant_get_type_string(aResult)));
                return;
              }
              RefPtr<GVariant> iTime =
                  dont_AddRef(g_variant_get_child_value(aResult, 0));
              if (!g_variant_is_of_type(iTime, G_VARIANT_TYPE_UINT64)) {
                MOZ_LOG(sIdleLog, LogLevel::Info,
                        ("PollIdleTime() Unexpected params type: %s\n",
                         g_variant_get_type_string(aResult)));
                return;
              }
              uint64_t idleTime = g_variant_get_uint64(iTime);
              if (idleTime > std::numeric_limits<uint32_t>::max()) {
                idleTime = std::numeric_limits<uint32_t>::max();
              }
              mCachedIdleTime = idleTime;
              mCacheTimestamp = TimeStamp::Now();
              MOZ_LOG(sIdleLog, LogLevel::Info,
                      ("Async handler got %d, cached\n", mCachedIdleTime));
            },
            [this](GUniquePtr<GError>&& aError) {
              mPollRequest.Complete();
              CancelTimer(mPollTimer);
              if (!IsCancelledGError(aError.get())) {
                MOZ_LOG(
                    sIdleLog, LogLevel::Warning,
                    ("Failed to call GetIdletime(): %s\n", aError->message));
              }
            })
        ->Track(mPollRequest);
  }

 public:
  bool ProbeImplementation() override {
    MOZ_LOG(sIdleLog, LogLevel::Info,
            ("UserIdleServiceMutter::UserIdleServiceMutter()\n"));

    mCancellable = dont_AddRef(g_cancellable_new());
    // The timer fires on the main thread: it cancels the in-flight proxy
    // creation and disconnects the request so the spin below exits. Capturing
    // this is safe: the timer is a member cancelled in the destructor.
    NS_NewTimerWithCallback(
        getter_AddRefs(mProbeTimer),
        [this](nsITimer*) {
          MOZ_LOG(sIdleLog, LogLevel::Warning,
                  ("ProbeImplementation() timed out\n"));
          g_cancellable_cancel(mCancellable);
          mProbeRequest.DisconnectIfExists();
        },
        TimeDuration::FromMilliseconds(kProbeTimeoutMs),
        nsITimer::TYPE_ONE_SHOT,
        "UserIdleServiceMutter::ProbeImplementation"_ns);

    CreateDBusProxyForBus(
        G_BUS_TYPE_SESSION,
        GDBusProxyFlags(G_DBUS_PROXY_FLAGS_DO_NOT_CONNECT_SIGNALS |
                        G_DBUS_PROXY_FLAGS_DO_NOT_LOAD_PROPERTIES),
        nullptr, "org.gnome.Mutter.IdleMonitor",
        "/org/gnome/Mutter/IdleMonitor/Core", "org.gnome.Mutter.IdleMonitor",
        mCancellable)
        ->Then(
            GetCurrentSerialEventTarget(), __func__,
            [this](RefPtr<GDBusProxy>&& aProxy) {
              mProbeRequest.Complete();
              CancelTimer(mProbeTimer);
              mProxy = std::move(aProxy);
            },
            [this](GUniquePtr<GError>&& aError) {
              mProbeRequest.Complete();
              CancelTimer(mProbeTimer);
              if (!IsCancelledGError(aError.get())) {
                MOZ_LOG(sIdleLog, LogLevel::Warning,
                        ("Failed to create DBus proxy: %s\n", aError->message));
              }
            })
        ->Track(mProbeRequest);

    SpinEventLoopUntil("UserIdleServiceMutter::ProbeImplementation"_ns, [&]() {
      return !mProbeRequest.Exists() ||
             AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed);
    });

    if (mProxy) {
      mUserIdleServiceGTK->AcceptServiceCallback();
    }
    return !!mProxy;
  }

  explicit UserIdleServiceMutter(nsUserIdleServiceGTK* aUserIdleService)
      : UserIdleServiceImpl(aUserIdleService) {};

  ~UserIdleServiceMutter() {
    mProbeRequest.DisconnectIfExists();
    mPollRequest.DisconnectIfExists();
    CancelTimer(mProbeTimer);
    CancelTimer(mPollTimer);
    if (mCancellable) {
      g_cancellable_cancel(mCancellable);
      mCancellable = nullptr;
    }
    mProxy = nullptr;
  }

 private:
  // Tolerance thresholds for cache freshness
  static constexpr uint32_t kCacheFreshMs = 1000;
  static constexpr uint32_t kCacheStaleMs = 5000;
  static_assert(kCacheStaleMs >= kCacheFreshMs,
                "The fresh window must be a subset of the stale window: "
                "PollIdleTime picks the fresh vs. stale branch by nesting "
                "elapsed < kCacheFreshMs inside elapsed < kCacheStaleMs.");
  static constexpr uint32_t kPollTimeoutMs = 3000;
  static constexpr uint32_t kProbeTimeoutMs = 3000;

  RefPtr<GDBusProxy> mProxy;
  RefPtr<GCancellable> mCancellable;
  MozPromiseRequestHolder<DBusProxyPromise> mProbeRequest;
  MozPromiseRequestHolder<DBusCallPromise> mPollRequest;
  nsCOMPtr<nsITimer> mProbeTimer;
  nsCOMPtr<nsITimer> mPollTimer;
  uint32_t mCachedIdleTime = 0;
  TimeStamp mCacheTimestamp;
};
#endif

void nsUserIdleServiceGTK::ProbeService() {
  MOZ_LOG(sIdleLog, LogLevel::Info,
          ("nsUserIdleServiceGTK::ProbeService() mIdleServiceType %d\n",
           mIdleServiceType));
  MOZ_ASSERT(!mIdleService);

  switch (mIdleServiceType) {
#ifdef MOZ_ENABLE_DBUS
    case IDLE_SERVICE_MUTTER:
      mIdleService = MakeUnique<UserIdleServiceMutter>(this);
      break;
#endif
#ifdef MOZ_X11
    case IDLE_SERVICE_XSCREENSAVER:
      mIdleService = MakeUnique<UserIdleServiceX11>(this);
      break;
#endif
    default:
      return;
  }

  if (!mIdleService->ProbeImplementation()) {
    RejectAndTryNextServiceCallback();
  }
}

void nsUserIdleServiceGTK::AcceptServiceCallback() {
  MOZ_LOG(sIdleLog, LogLevel::Info,
          ("nsUserIdleServiceGTK::AcceptServiceCallback() type %d\n",
           mIdleServiceType));
  mIdleServiceInitialized = true;
}

void nsUserIdleServiceGTK::RejectAndTryNextServiceCallback() {
  MOZ_LOG(sIdleLog, LogLevel::Info,
          ("nsUserIdleServiceGTK::RejectAndTryNextServiceCallback() type %d\n",
           mIdleServiceType));

  // Delete recent non-working service
  MOZ_ASSERT(mIdleService, "Nothing to reject?");
  mIdleService = nullptr;
  mIdleServiceInitialized = false;

  mIdleServiceType++;
  if (mIdleServiceType < IDLE_SERVICE_NONE) {
    MOZ_LOG(sIdleLog, LogLevel::Info,
            ("nsUserIdleServiceGTK try next idle service\n"));
    ProbeService();
  } else {
    MOZ_LOG(sIdleLog, LogLevel::Info, ("nsUserIdleServiceGTK failed\n"));
  }
}

bool nsUserIdleServiceGTK::PollIdleTime(uint32_t* aIdleTime) {
  if (!mIdleServiceInitialized) {
    return false;
  }
  return mIdleService->PollIdleTime(aIdleTime);
}
