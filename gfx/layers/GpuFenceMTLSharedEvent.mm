/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GpuFenceMTLSharedEvent.h"

#import <Metal/Metal.h>

#include "GLContextEGL.h"
#include "mozilla/gfx/Logging.h"

namespace mozilla {
namespace layers {

/* static */
RefPtr<GpuFenceMTLSharedEvent> GpuFenceMTLSharedEvent::Create(
    void* aSharedEvent, const uint64_t aFenceValue) {
  if (!aSharedEvent) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }
  return new GpuFenceMTLSharedEvent(aSharedEvent, aFenceValue);
}

GpuFenceMTLSharedEvent::GpuFenceMTLSharedEvent(void* aSharedEvent,
                                               const uint64_t aFenceValue)
    : mSharedEvent(aSharedEvent), mFenceValue(aFenceValue) {}

GpuFenceMTLSharedEvent::~GpuFenceMTLSharedEvent() {
  [(__bridge id<MTLSharedEvent>)mSharedEvent release];
}

bool GpuFenceMTLSharedEvent::HasCompleted() {
  const auto sharedEvent = (__bridge id<MTLSharedEvent>)mSharedEvent;
  return sharedEvent.signaledValue >= mFenceValue;
}

bool GpuFenceMTLSharedEvent::ClientWait(TimeDuration aTimeout) {
  if (@available(macOS 12.0, iOS 15.0, *)) {
    const auto sharedEvent = (__bridge id<MTLSharedEvent>)mSharedEvent;
    const uint64_t timeoutMs =
        aTimeout == TimeDuration::Forever()
            ? std::numeric_limits<uint64_t>::max()
            : static_cast<uint64_t>(aTimeout.ToMilliseconds());
    return [sharedEvent waitUntilSignaledValue:mFenceValue timeoutMS:timeoutMs];
  }

  const auto start = TimeStamp::Now();
  while (!HasCompleted()) {
    if (aTimeout != TimeDuration::Forever() &&
        TimeStamp::Now() - start >= aTimeout) {
      return false;
    }
    PR_Sleep(PR_MillisecondsToInterval(1));
  }
  return true;
}

bool GpuFenceMTLSharedEvent::ServerWait(gl::GLContext* aGL,
                                        TimeDuration aTimeout) {
  if (aGL->GetContextType() == gl::GLContextType::EGL) {
    const auto* gle = gl::GLContextEGL::Cast(aGL);
    const auto& egl = gle->mEgl;
    if (egl->IsExtensionSupported(gl::EGLExtension::KHR_wait_sync) &&
        egl->IsExtensionSupported(
            gl::EGLExtension::ANGLE_metal_shared_event_sync) &&
        aGL->MakeCurrent()) {
      const EGLAttrib attributes[] = {
          LOCAL_EGL_SYNC_METAL_SHARED_EVENT_OBJECT_ANGLE,
          reinterpret_cast<EGLAttrib>(mSharedEvent),
          LOCAL_EGL_SYNC_CONDITION,
          LOCAL_EGL_SYNC_METAL_SHARED_EVENT_SIGNALED_ANGLE,
          LOCAL_EGL_SYNC_METAL_SHARED_EVENT_SIGNAL_VALUE_LO_ANGLE,
          static_cast<EGLAttrib>(mFenceValue & 0xFFFFFFFF),
          LOCAL_EGL_SYNC_METAL_SHARED_EVENT_SIGNAL_VALUE_HI_ANGLE,
          static_cast<EGLAttrib>(mFenceValue >> 32),
          LOCAL_EGL_NONE};
      const EGLSync sync = egl->fCreateSyncEGL15(
          LOCAL_EGL_SYNC_METAL_SHARED_EVENT_ANGLE, attributes);
      if (!sync) {
        gfxCriticalNote << "Importing Metal shared event as EGLSync failed";
      } else {
        const EGLint success = egl->fWaitSync(sync, 0);
        egl->fDestroySync(sync);
        if (!success) {
          gfxCriticalNote << "Waiting on Metal shared event failed";
        } else {
          return true;
        }
      }
    }
  }

  return ClientWait(aTimeout);
}

}  // namespace layers
}  // namespace mozilla
