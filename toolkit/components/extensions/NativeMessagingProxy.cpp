/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "NativeMessagingProxy.h"

#include <gio/gunixfdlist.h>
#include <glib.h>

#include "mozilla/ClearOnShutdown.h"
#include "mozilla/GUniquePtr.h"
#include "mozilla/Logging.h"
#include "mozilla/UniquePtrExtensions.h"
#include "mozilla/WidgetUtilsGtk.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/widget/AsyncDBus.h"

#include "prlink.h"

static mozilla::LazyLogModule gNativeMessagingProxyLog("NativeMessagingProxy");

#ifdef MOZ_LOGGING
#  define LOG_NMPROXY(...) \
    MOZ_LOG(gNativeMessagingProxyLog, mozilla::LogLevel::Debug, (__VA_ARGS__))
#else
#  define LOG_NMPROXY(...)
#endif

#define GET_FUNC(func, lib) \
  func##_fn = (decltype(func##_fn))PR_FindFunctionSymbol(lib, #func)

static const char* const kNativeMessagingProxyName =
    "org.freedesktop.NativeMessagingProxy";
static const char* const kNativeMessagingProxyInterface =
    "org.freedesktop.NativeMessagingProxy";
static const char* const kNativeMessagingProxyObjectPath =
    "/org/freedesktop/nativemessagingproxy";
static const char* const kNativeMessagingProxyMode = "mozilla";

static gint _g_unix_fd_list_get(GUnixFDList* list, gint index_,
                                GError** error) {
  static PRLibrary* gioLib = nullptr;
  static bool gioInitialized = false;
  static gint (*g_unix_fd_list_get_fn)(GUnixFDList* list, gint index_,
                                       GError** error) = nullptr;

  if (!gioInitialized) {
    gioInitialized = true;
    gioLib = PR_LoadLibrary("libgio-2.0.so.0");
    if (!gioLib) {
      return -1;
    }
    GET_FUNC(g_unix_fd_list_get, gioLib);
  }

  if (!g_unix_fd_list_get_fn) {
    return -1;
  }

  return g_unix_fd_list_get_fn(list, index_, error);
}

namespace mozilla::extensions {

NS_IMPL_ISUPPORTS(NativeMessagingProxy, nsINativeMessagingProxy)

/* static */
already_AddRefed<NativeMessagingProxy> NativeMessagingProxy::GetSingleton() {
  static StaticRefPtr<NativeMessagingProxy> sInstance;

  if (MOZ_UNLIKELY(!sInstance)) {
    sInstance = new NativeMessagingProxy();
    ClearOnShutdown(&sInstance);
    // KillClearOnShutdown is LIFO, so this runs first, cancelling pending D-Bus
    // calls before the sInstance is cleared.
    RunOnShutdown([instance = &sInstance] {
      if (*instance) {
        g_cancellable_cancel((*instance)->mCancellable);
      }
    });
  }

  return do_AddRef(sInstance);
}

static void LogError(const char* aMethod, const GError& aError) {
  g_warning("%s error: %s", aMethod, aError.message);
}

NativeMessagingProxy::NativeMessagingProxy() {
  LOG_NMPROXY("NativeMessagingProxy::NativeMessagingProxy()");
  mCancellable = dont_AddRef(g_cancellable_new());
}

NativeMessagingProxy::~NativeMessagingProxy() {
  LOG_NMPROXY("NativeMessagingProxy::~NativeMessagingProxy()");

  if (!mProxy) {
    LOG_NMPROXY("failed to get a D-Bus proxy");
    return;
  }

  for (const auto& handle : mSessions) {
    GUniquePtr<GError> error;
    GVariantBuilder options;
    g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
    RefPtr<GVariant> res = dont_AddRef(g_dbus_proxy_call_sync(
        mProxy, "Close", g_variant_new("(oa{sv})", handle.get(), &options),
        G_DBUS_CALL_FLAGS_NONE, -1, nullptr, getter_Transfers(error)));
    LOG_NMPROXY("closing: %s", handle.get());
    if (!res) {
      LOG_NMPROXY("failed to close session: %s", error->message);
      LogError(__func__, *error);
    }
  }
}

NS_IMETHODIMP
NativeMessagingProxy::ShouldUse(bool* aResult) {
  *aResult = widget::ShouldUsePortal(widget::PortalKind::NativeMessagingProxy);
  LOG_NMPROXY("will %sbe used", *aResult ? "" : "not ");
  return NS_OK;
}

NS_IMETHODIMP
NativeMessagingProxy::GetAvailable(JSContext* aCx, dom::Promise** aPromise) {
  MOZ_ASSERT(aCx);
  MOZ_ASSERT(aPromise);

  if (!mAvailablePromise) {
    auto holder = MakeRefPtr<GenericNonExclusivePromise::Private>(__func__);

    widget::CreateDBusProxyForBus(
        G_BUS_TYPE_SESSION, GDBusProxyFlags(G_DBUS_PROXY_FLAGS_NONE),
        /* aInterfaceInfo = */ nullptr, kNativeMessagingProxyName,
        kNativeMessagingProxyObjectPath, kNativeMessagingProxyInterface,
        mCancellable)
        ->Then(
            GetCurrentSerialEventTarget(), __func__,
            [self = RefPtr{this}, this, holder](RefPtr<GDBusProxy>&& aProxy) {
              mProxy = std::move(aProxy);
              bool available = false;
              RefPtr<GVariant> version = dont_AddRef(
                  g_dbus_proxy_get_cached_property(mProxy, "version"));
              if (!version ||
                  !g_variant_is_of_type(version, G_VARIANT_TYPE_UINT32)) {
                LOG_NMPROXY(
                    "failed to get version for "
                    "org.freedesktop.NativeMessagingProxy");
                mProxy = nullptr;
                holder->Resolve(false, __func__);
                return;
              }
              if (g_variant_get_uint32(version) >= 1) {
                available = true;
              } else {
                mProxy = nullptr;
              }
              LOG_NMPROXY("is %savailable", available ? "" : "not ");
              holder->Resolve(available, __func__);
            },
            [self = RefPtr{this}, holder](GUniquePtr<GError>&& aError) {
              LOG_NMPROXY(
                  "failed to get dbus proxy for "
                  "org.freedesktop.NativeMessagingProxy: %s",
                  aError->message);
              holder->Resolve(false, __func__);
            });
    mAvailablePromise = holder;
  }

  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(aCx);
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  ErrorResult result;
  RefPtr<dom::Promise> retPromise = dom::Promise::Create(globalObject, result);
  if (NS_WARN_IF(result.Failed())) {
    return result.StealNSResult();
  }

  mAvailablePromise->Then(
      GetCurrentSerialEventTarget(), __func__,
      [retPromise](bool aAvailable) { retPromise->MaybeResolve(aAvailable); },
      [retPromise](nsresult aError) { retPromise->MaybeReject(aError); });

  retPromise.forget(aPromise);
  return NS_OK;
}

NS_IMETHODIMP
NativeMessagingProxy::CloseSession(const nsACString& aHandle, JSContext* aCx,
                                   dom::Promise** aPromise) {
  const nsCString& sessionHandle = PromiseFlatCString(aHandle);

  if (!mProxy) {
    LOG_NMPROXY("failed - dbus proxy not available");
    return NS_ERROR_FAILURE;
  }

  if (!g_variant_is_object_path(sessionHandle.get())) {
    LOG_NMPROXY("cannot close session %s, invalid handle", sessionHandle.get());
    return NS_ERROR_INVALID_ARG;
  }

  if (!mSessions.RemoveElement(sessionHandle)) {
    LOG_NMPROXY("cannot close session %s, unknown handle", sessionHandle.get());
    return NS_ERROR_INVALID_ARG;
  }

  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(aCx);
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  ErrorResult result;
  RefPtr<dom::Promise> retPromise = dom::Promise::Create(globalObject, result);
  if (NS_WARN_IF(result.Failed())) {
    return result.StealNSResult();
  }

  LOG_NMPROXY("closing session %s", sessionHandle.get());

  GVariantBuilder options;
  g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
  widget::DBusProxyCall(
      mProxy, "Close", g_variant_new("(oa{sv})", sessionHandle.get(), &options),
      G_DBUS_CALL_FLAGS_NONE, -1, nullptr)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [s = RefPtr{this}, sessionHandle,
           retPromise](RefPtr<GVariant>&& aResult) {
            LOG_NMPROXY("session %s closed", sessionHandle.get());
            retPromise->MaybeResolveWithUndefined();
          },
          [s = RefPtr{this}, sessionHandle,
           retPromise](GUniquePtr<GError>&& aError) {
            LOG_NMPROXY("failed to close session %s: %s", sessionHandle.get(),
                        aError->message);
            LogError(__func__, *aError);
            retPromise->MaybeRejectWithUnknownError(nsPrintfCString(
                "failed - Close method failed: %s", aError->message));
          });

  retPromise.forget(aPromise);
  return NS_OK;
}

NS_IMETHODIMP
NativeMessagingProxy::GetManifest(const nsACString& aName,
                                  const nsACString& aExtension, JSContext* aCx,
                                  dom::Promise** aPromise) {
  const nsCString& name = PromiseFlatCString(aName);
  const nsCString& extension = PromiseFlatCString(aExtension);

  if (!mProxy) {
    LOG_NMPROXY("mProxy not initialized, failed to GetManifest");
    return NS_ERROR_FAILURE;
  }

  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(aCx);
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  ErrorResult result;
  RefPtr<dom::Promise> retPromise = dom::Promise::Create(globalObject, result);
  if (NS_WARN_IF(result.Failed())) {
    return result.StealNSResult();
  }

  GVariantBuilder options;
  g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
  widget::DBusProxyCall(mProxy, "GetManifest",
                        g_variant_new("(ssa{sv})", name.get(),
                                      kNativeMessagingProxyMode, &options),
                        G_DBUS_CALL_FLAGS_NONE, -1, nullptr)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [s = RefPtr{this}, retPromise](RefPtr<GVariant>&& aResult) {
            RefPtr<GVariant> jsonManifest =
                dont_AddRef(g_variant_get_child_value(aResult, 0));
            gsize length;
            const char* value = g_variant_get_string(jsonManifest, &length);
            LOG_NMPROXY("manifest found: %s", value);
            retPromise->MaybeResolve(nsDependentCString(value, length));
          },
          [s = RefPtr{this}, name, extension,
           retPromise](GUniquePtr<GError>&& aError) {
            LOG_NMPROXY("failed to find a manifest %s for %s: %s", name.get(),
                        extension.get(), aError->message);
            LogError(__func__, *aError);
            retPromise->MaybeRejectWithNotFoundError(
                "failed to find a manifest");
          });

  retPromise.forget(aPromise);
  return NS_OK;
}

static int GetFD(const RefPtr<GVariant>& result, GUnixFDList* fds, gint index) {
  RefPtr<GVariant> value =
      dont_AddRef(g_variant_get_child_value(result, index));
  GUniquePtr<GError> error;
  gint fd = _g_unix_fd_list_get(fds, g_variant_get_handle(value),
                                getter_Transfers(error));
  if (fd == -1) {
    if (error) {
      LOG_NMPROXY("failed to get file descriptor at index %d: %s", index,
                  error->message);
      LogError("GetFD", *error);
    } else {
      LOG_NMPROXY(
          "failed to get file descriptor at index %d, g_unix_fd_list_get not "
          "available",
          index);
    }
  }
  return fd;
}

NS_IMETHODIMP
NativeMessagingProxy::Start(const nsACString& aName,
                            const nsACString& aExtension, JSContext* aCx,
                            dom::Promise** aPromise) {
  const nsCString& name = PromiseFlatCString(aName);
  const nsCString& extension = PromiseFlatCString(aExtension);

  if (!mProxy) {
    LOG_NMPROXY("cannot start %s, missing D-Bus proxy", name.get());
    return NS_ERROR_FAILURE;
  }

  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(aCx);
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  ErrorResult result;
  RefPtr<dom::Promise> retPromise = dom::Promise::Create(globalObject, result);
  if (NS_WARN_IF(result.Failed())) {
    return result.StealNSResult();
  }

  GVariantBuilder options;
  g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);

  widget::DBusProxyCallWithUnixFDList(
      mProxy, "Start",
      g_variant_new("(sssa{sv})", name.get(), extension.get(),
                    kNativeMessagingProxyMode, &options),
      G_DBUS_CALL_FLAGS_NONE, -1, nullptr, nullptr)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [s = RefPtr{this}, this, retPromise](
              std::pair<RefPtr<GVariant>, RefPtr<GUnixFDList>>&& aResult) {
            UniqueFileHandle _stdin(GetFD(aResult.first, aResult.second, 0));
            UniqueFileHandle _stdout(GetFD(aResult.first, aResult.second, 1));
            UniqueFileHandle _stderr(GetFD(aResult.first, aResult.second, 2));
            RefPtr<GVariant> handle =
                dont_AddRef(g_variant_get_child_value(aResult.first, 3));
            const char* handle_str = g_variant_get_string(handle, nullptr);

            LOG_NMPROXY(
                "got file descriptors for native application handle %s: (%d, "
                "%d, %d)",
                handle_str, static_cast<int>(_stdin.get()),
                static_cast<int>(_stdout.get()),
                static_cast<int>(_stderr.get()));

            if (_stdin.get() == nullptr || _stdout.get() == nullptr ||
                _stderr.get() == nullptr) {
              return retPromise->MaybeRejectWithOperationError(
                  "Invalid file descriptor");
            }
            mSessions.AppendElement(nsCString(handle_str));

            dom::AutoJSAPI jsapi;
            if (NS_WARN_IF(!jsapi.Init(retPromise->GetGlobalObject()))) {
              return retPromise->MaybeRejectWithUnknownError(
                  "Failed to initialize JS context");
            }
            JSContext* cx = jsapi.cx();

            JS::Rooted<JSObject*> jsPipes(cx, JS_NewPlainObject(cx));
            if (!jsPipes) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to create a JS object to hold the file descriptors");
            }

            auto setPipeProperty = [&](const char* name, int32_t value) {
              JS::Rooted<JS::Value> jsValue(cx, JS::Value::fromInt32(value));
              return JS_SetProperty(cx, jsPipes, name, jsValue);
            };
            if (!setPipeProperty("stdin", _stdin.get())) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to set the 'stdin' property on the JS object");
            }
            if (!setPipeProperty("stdout", _stdout.get())) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to set the 'stdout' property on the JS object");
            }
            if (!setPipeProperty("stderr", _stderr.get())) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to set the 'stderr' property on the JS object");
            }

            JSString* strHandle = JS_NewStringCopyZ(cx, handle_str);
            if (!strHandle) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to create the JS string containing handle");
            }
            JS::Rooted<JS::Value> jsString(cx, JS::StringValue(strHandle));
            if (!JS_SetProperty(cx, jsPipes, "handle", jsString)) {
              return retPromise->MaybeRejectWithOperationError(
                  "Failed to set the 'handle' property on the JS object");
            }
            _stdin.release();
            _stdout.release();
            _stderr.release();
            retPromise->MaybeResolve(jsPipes);
          },
          [s = RefPtr{this}, retPromise](GUniquePtr<GError>&& aError) {
            LOG_NMPROXY(
                "failed to get file descriptors for native application: "
                "%s",
                aError->message);
            LogError(__func__, *aError);
            retPromise->MaybeRejectWithAbortError("failed to obtain fds");
          });

  retPromise.forget(aPromise);
  return NS_OK;
}

}  // namespace mozilla::extensions
