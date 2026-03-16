/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AndroidVsync.h"

#include "AndroidBridge.h"
#include "AndroidUiThread.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

namespace mozilla {
namespace widget {

MOZ_RELEASE_CONSTINIT StaticDataMutex<ThreadSafeWeakPtr<AndroidVsync>>
    AndroidVsync::sInstance("AndroidVsync::sInstance");

/* static */ RefPtr<AndroidVsync> AndroidVsync::GetInstance() {
  auto weakInstance = sInstance.Lock();
  RefPtr<AndroidVsync> instance(*weakInstance);
  if (!instance) {
    instance = new AndroidVsync();
    // Choreographer must be obtained on the thread we want the callbacks to run
    // on, which is the Android UI thread.
    if (RefPtr<nsThread> uiThread = GetAndroidUiThread()) {
      uiThread->Dispatch(
          NS_NewRunnableFunction("AndroidVsync::Init", [instance]() {
            {
              auto impl = instance->mImpl.Lock();
              impl->mToken =
                  std::make_unique<ThreadSafeWeakPtr<AndroidVsync>>(instance);
              impl->mChoreographer = AChoreographer_getInstance();
            }
            // If we have already registered observers but were unable to
            // request a frame callback because we did not yet have the
            // choreographer, then request one now.
            instance->MaybePostFrameCallback();
          }));
    }
    *weakInstance = instance;
  }
  return instance;
}

void AndroidVsync::RegisterObserver(Observer* aObserver, ObserverType aType) {
  {
    auto impl = mImpl.Lock();
    if (aType == AndroidVsync::INPUT) {
      impl->mInputObservers.AppendElement(aObserver);
    } else {
      impl->mRenderObservers.AppendElement(aObserver);
    }
  }
  MaybePostFrameCallback();
}

void AndroidVsync::UnregisterObserver(Observer* aObserver, ObserverType aType) {
  auto impl = mImpl.Lock();
  if (aType == AndroidVsync::INPUT) {
    impl->mInputObservers.RemoveElement(aObserver);
  } else {
    impl->mRenderObservers.RemoveElement(aObserver);
  }
  aObserver->Dispose();
}

Maybe<std::pair<AChoreographer*, AndroidVsync::CallbackToken>>
AndroidVsync::Impl::ShouldPostFrameCallback() {
  // We need to post a frame callback if we have any observers, AND the
  // choreographer has already been initialized, AND a callback is not already
  // pending (implied by mToken being non-null). Note that mChoreographer is
  // safe to return to outside the lock because once it has been initialized it
  // is never modified or destroyed.
  if ((!mInputObservers.IsEmpty() || !mRenderObservers.IsEmpty()) &&
      mChoreographer && mToken) {
    return Some(std::make_pair(mChoreographer, std::move(mToken)));
  }
  return Nothing();
}

void AndroidVsync::MaybePostFrameCallback() {
  auto shouldPost = [&]() {
    auto lock = mImpl.Lock();
    return lock->ShouldPostFrameCallback();
  }();
  if (shouldPost) {
    auto [choreographer, token] = shouldPost.extract();
    PostFrameCallback(choreographer, std::move(token));
  }
}

/* static */
void AndroidVsync::PostFrameCallback(AChoreographer* aChoreographer,
                                     CallbackToken aToken) {
  MOZ_ASSERT(aChoreographer);
  MOZ_ASSERT(aToken);
  if (__builtin_available(android 29, *)) {
    AChoreographer_postFrameCallback64(
        aChoreographer, &AndroidVsync::FrameCallback64, aToken.release());
  } else {
    AChoreographer_postFrameCallback(
        aChoreographer, &AndroidVsync::FrameCallback, aToken.release());
  }
}

/* static */
void AndroidVsync::FrameCallback(long aFrameTimeNanos, void* aData) {
  MOZ_ASSERT(AndroidBridge::IsJavaUiThread());
  static_assert(sizeof(long) == 4 || sizeof(long) == 8);

  if constexpr (sizeof(long) == 8) {
    FrameCallback64(aFrameTimeNanos, aData);
  } else {
    // The AChoreographer_postFrameCallback documentation states:
    // The callback receives the frame time in nanoseconds as a long. On 32-bit
    // systems, long is 32-bit, so the frame time will roll over roughly every
    // two seconds. You must combine the argument with the upper bits of
    // clock_gettime(CLOCK_MONOTONIC, ...) on 32-bit systems.
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    const int64_t now =
        static_cast<int64_t>(ts.tv_sec) * 1'000'000'000LL + ts.tv_nsec;
    // Android narrows its 64 bit timestamp to a 32 bit long to give us
    // `aFrameTimeNanos`, which is implementation-defined behaviour, but in
    // practice will simply truncate the bits meaning we can interpret as a
    // uint32_t. If this value is greater than the lower 32 bits of `now` then
    // the lower bits of `now` must have overflown since the timestamp was
    // captured. Subtract one period from the higher bits to account for this.
    int64_t fullFrameTime =
        (now & ~0xFFFFFFFFLL) | static_cast<uint32_t>(aFrameTimeNanos);
    if (static_cast<uint32_t>(aFrameTimeNanos) > static_cast<uint32_t>(now)) {
      fullFrameTime -= (1LL << 32);
    }

    FrameCallback64(fullFrameTime, aData);
  }
}

// Always called on the Java UI thread.
/* static */
void AndroidVsync::FrameCallback64(int64_t aFrameTimeNanos, void* aData) {
  MOZ_ASSERT(AndroidBridge::IsJavaUiThread());

  CallbackToken token(static_cast<ThreadSafeWeakPtr<AndroidVsync>*>(aData));
  RefPtr<AndroidVsync> self(*token);
  if (!self) {
    return;
  }

  // Convert aFrameTimeNanos to a TimeStamp. The value converts trivially to
  // the internal ticks representation of TimeStamp_posix; both use the
  // monotonic clock and are in nanoseconds.
  TimeStamp timeStamp = TimeStamp::FromSystemTime(aFrameTimeNanos);

  // Do not keep the lock held while calling OnVsync or PostFrameCallback.
  // Use AutoTArray to avoid frequent allocations in the common case that can
  // show up in profiles.
  AutoTArray<Observer*, 2> observers;
  AChoreographer* choreographer = nullptr;
  {
    auto impl = self->mImpl.Lock();
    choreographer = impl->mChoreographer;
    observers.AppendElements(impl->mInputObservers);
    observers.AppendElements(impl->mRenderObservers);

    if (observers.IsEmpty()) {
      // We don't need to post another frame callback immediately. Restore
      // impl's mToken, allowing it to post another when required.
      MOZ_ASSERT(!impl->mToken);
      impl->mToken = std::move(token);
    }
  }

  if (token) {
    PostFrameCallback(choreographer, std::move(token));
  }

  for (Observer* observer : observers) {
    observer->OnVsync(timeStamp);
  }
}

void AndroidVsync::OnMaybeUpdateRefreshRate() {
  MOZ_ASSERT(NS_IsMainThread());

  auto impl = mImpl.Lock();

  nsTArray<Observer*> observers;
  observers.AppendElements(impl->mRenderObservers);

  for (Observer* observer : observers) {
    observer->OnMaybeUpdateRefreshRate();
  }
}

}  // namespace widget
}  // namespace mozilla
