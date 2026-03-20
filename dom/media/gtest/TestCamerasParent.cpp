/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include <memory>

#include "CamerasParent.h"
#include "VideoEngine.h"
#include "api/video/i420_buffer.h"
#include "gmock/gmock.h"
#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/ipc/BackgroundParent.h"
#include "video_engine/video_capture_factory.h"

using testing::_;
using testing::Eq;
using testing::Property;
using testing::Test;

namespace mozilla::camera {
static void WaitForBackgroundThread() {
  nsCOMPtr<nsISerialEventTarget> backgroundThread =
      ipc::BackgroundParent::GetBackgroundThread();
  MOZ_ALWAYS_SUCCEEDS(SyncRunnable::DispatchToThread(
      backgroundThread,
      NS_NewRunnableFunction("TestAggregateCapturer::TearDown", [] {})));
}

class MockCamerasParent : public CamerasParent {
 public:
  static already_AddRefed<MockCamerasParent> Create() {
    nsCOMPtr<nsISerialEventTarget> backgroundThread =
        ipc::BackgroundParent::GetBackgroundThread();

    RefPtr<MockCamerasParent> parent;
    MOZ_ALWAYS_SUCCEEDS(SyncRunnable::DispatchToThread(
        backgroundThread,
        NS_NewRunnableFunction("TestAggregateCapturer::SetUp",
                               [&] { parent = new MockCamerasParent(); })));
    return parent.forget();
  }

  MOCK_METHOD(int, DeliverFrameOverIPC,
              (CaptureEngine, int, const Span<const int>&, const TrackingId&,
               (Variant<ShmemBuffer, webrtc::VideoFrame>&&),
               const VideoFrameProperties&),
              (override));
};

struct TestAggregateCapturer : public Test {
  static constexpr uint64_t kWindowId = 1;
  const CaptureEngine mCapEngine = CameraEngine;
  const CaptureDeviceType mDeviceType = ([&] {
    switch (mCapEngine) {
      case InvalidEngine:
      case MaxEngine:
      case CameraEngine:
        return CaptureDeviceType::Camera;
      case ScreenEngine:
        return CaptureDeviceType::Screen;
      case WinEngine:
        return CaptureDeviceType::Window;
      case BrowserEngine:
        return CaptureDeviceType::Browser;
    }
    return CaptureDeviceType::Camera;
  })();
  RefPtr<VideoEngine> mEngine =
      VideoEngine::Create(mDeviceType, MakeRefPtr<VideoCaptureFactory>());
  RefPtr<MockCamerasParent> mParent;
  std::unique_ptr<AggregateCapturer> mAggregator;

  void SetUp() override {
    Preferences::SetBool("media.getusermedia.camera.fake.force", true);
    nsTArray<webrtc::VideoCaptureCapability> capabilities;

    mParent = MockCamerasParent::Create();

    constexpr size_t capacity = 32;
    char deviceName[capacity], uniqueId[capacity];
    auto info = mEngine->GetOrCreateVideoCaptureDeviceInfo();
    info->GetDeviceName(0, deviceName, capacity, uniqueId, capacity);

    for (int i = 0; i < info->NumberOfCapabilities(uniqueId); ++i) {
      webrtc::VideoCaptureCapability cap;
      if (info->GetCapability(uniqueId, i, cap) == 0) {
        capabilities.AppendElement(std::move(cap));
      }
    }

    mAggregator =
        AggregateCapturer::Create(GetCurrentSerialEventTarget(), mCapEngine,
                                  mEngine, nsCString(uniqueId, capacity),
                                  kWindowId, std::move(capabilities), mParent);
  }

  void TearDown() override {
    Preferences::ClearUser("media.getusermedia.camera.fake.force");
    mAggregator->RemoveStreamsFor(mParent);
    mAggregator = nullptr;
    mParent = nullptr;
    mEngine = nullptr;
    // Resetting mParent bounces the delete to the background thread. Do it here
    // too, to stay in sync.
    WaitForBackgroundThread();
    // Process video capture thread messages from the CamerasParent dtor.
    NS_ProcessPendingEvents(nullptr);
  }
};

TEST_F(TestAggregateCapturer, EmptyLifeCycle) {
  // Checks that lifecycle is OK with simple Create()/RemoveStreamsFor().
}

TEST_F(TestAggregateCapturer, TwoStreamsLifeCycle) {
  // Checks that lifecycle is OK with simple
  // Create()+AddStream()/RemoveStreamsFor().
  mAggregator->AddStream(mParent, mEngine->GenerateId(), kWindowId);
}

TEST_F(TestAggregateCapturer, FrameDelivery) {
  webrtc::VideoCaptureCapability cap;
  cap.width = 640;
  cap.height = 480;
  cap.maxFPS = 30;
  cap.videoType = webrtc::VideoType::kI420;
  NormalizedConstraints constraints;
  dom::VideoResizeModeEnum resizeMode =
      dom::VideoResizeModeEnum::Crop_and_scale;
  mAggregator->StartStream(mAggregator->mCaptureId, cap, constraints,
                           resizeMode);

  constexpr int width = 240, height = 160;
  constexpr int64_t time = 123;

  EXPECT_CALL(*mParent,
              DeliverFrameOverIPC(
                  CameraEngine, mAggregator->mCaptureId, _, _, _,
                  Property(&VideoFrameProperties::renderTimeMs, Eq(time))));

  auto buffer = webrtc::I420Buffer::Create(width, height);
  webrtc::I420Buffer::SetBlack(buffer.get());
  auto frame = webrtc::VideoFrame::Builder()
                   .set_video_frame_buffer(buffer)
                   .set_timestamp_ms(time)
                   .build();
  mAggregator->OnFrame(frame);

  WaitForBackgroundThread();
}
}  // namespace mozilla::camera
