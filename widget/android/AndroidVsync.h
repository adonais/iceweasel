/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_widget_AndroidVsync_h
#define mozilla_widget_AndroidVsync_h

#include <android/choreographer.h>
#include <memory>

#include "mozilla/DataMutex.h"
#include "mozilla/ThreadSafeWeakPtr.h"
#include "mozilla/TimeStamp.h"
#include "nsTArray.h"

namespace mozilla {
namespace widget {

/**
 * A thread-safe way to listen to vsync notifications on Android. All methods
 * can be called on any thread.
 * Observers must keep a strong reference to the AndroidVsync instance until
 * they unregister themselves.
 */
class AndroidVsync final : public SupportsThreadSafeWeakPtr<AndroidVsync> {
 public:
  MOZ_DECLARE_REFCOUNTED_TYPENAME(AndroidVsync)

  static RefPtr<AndroidVsync> GetInstance();

  class Observer {
   public:
    // Will be called on the Java UI thread.
    virtual void OnVsync(const TimeStamp& aTimeStamp) = 0;
    // Will be called on the Java UI thread.
    virtual void OnMaybeUpdateRefreshRate() {}
    // Called when the observer is unregistered, in case it wants to
    // manage its own lifetime.
    virtual void Dispose() {}
    virtual ~Observer() = default;
  };

  // INPUT observers are called before RENDER observers.
  enum ObserverType { INPUT, RENDER };
  void RegisterObserver(Observer* aObserver, ObserverType aType);
  void UnregisterObserver(Observer* aObserver, ObserverType aType);

  void OnMaybeUpdateRefreshRate();

 private:
  AndroidVsync() = default;

  // A heap allocated weak pointer to an AndroidVsync object, intended to be
  // passed as the `data` argument to AChoreographer_postFrameCallback(64),
  // allowing the callback functions to check whether the AndroidVsync is still
  // alive. Unique ownership ensures we will only post a single callback at a
  // time.
  using CallbackToken = std::unique_ptr<ThreadSafeWeakPtr<AndroidVsync>>;

  // Posts a frame callback if we have registered observers and one is not
  // already pending.
  void MaybePostFrameCallback();
  static void PostFrameCallback(AChoreographer* aChoreographer,
                                CallbackToken aToken);
  // Frame callback used on SDK levels prior to 28.
  static void FrameCallback(long aFrameTimeNanos, void* aData);
  // Frame callback used on SDK levels 29 onward.
  static void FrameCallback64(int64_t aFrameTimeNanos, void* aData);

  struct Impl {
    // If we should and are able to post a frame callback then returns the data
    // required to do so, transferring ownership of mToken to the caller.
    Maybe<std::pair<AChoreographer*, CallbackToken>> ShouldPostFrameCallback();

    nsTArray<Observer*> mInputObservers;
    nsTArray<Observer*> mRenderObservers;
    // Must be initialized on the Android UI thread. Never modified or destroyed
    // after initialization.
    AChoreographer* mChoreographer = nullptr;
    // If null, indicates that a frame callback is pending and another should
    // not be scheduled. If non-null, we are allowed to post a new callback.
    // This is set to point to the owning AndroidVsync on initialization, and
    // ownership is transferred by ShouldPostFrameCallback(). It is the
    // callback's responsibility to restore this field when finished with the
    // token.
    CallbackToken mToken;
  };

  DataMutex<Impl> mImpl{"AndroidVsync.mImpl"};

  static StaticDataMutex<ThreadSafeWeakPtr<AndroidVsync>> sInstance;
};

}  // namespace widget
}  // namespace mozilla

#endif  // mozilla_widget_AndroidVsync_h
