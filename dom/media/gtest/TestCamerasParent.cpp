/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include <memory>

#include "CamerasParent.h"
#include "VideoEngine.h"
#include "api/video/i420_buffer.h"
#include "fake_video_capture/device_info_fake.h"
#include "gmock/gmock.h"
#include "gtest/gtest.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/ipc/BackgroundParent.h"
#include "video_engine/video_capture_factory.h"

using testing::_;
using testing::Eq;
using testing::InSequence;
using testing::Matcher;
using testing::NiceMock;
using testing::Property;
using testing::Return;
using testing::Test;
using webrtc::VideoCaptureModule;
using webrtc::videocapturemodule::DeviceInfoFake;

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

class MockVideoCapturer : public webrtc::VideoCaptureModule {
 public:
  MOCK_METHOD(void, RegisterCaptureDataCallback,
              (webrtc::VideoSinkInterface<webrtc::VideoFrame>*), (override));
  MOCK_METHOD(void, RegisterCaptureDataCallback,
              (webrtc::RawVideoSinkInterface*), (override));
  MOCK_METHOD(void, DeRegisterCaptureDataCallback, (), (override));
  MOCK_METHOD(int32_t, StartCapture, (const webrtc::VideoCaptureCapability&),
              (override));
  MOCK_METHOD(int32_t, StopCapture, (), (override));
  MOCK_METHOD(const char*, CurrentDeviceName, (), (const, override));
  MOCK_METHOD(bool, CaptureStarted, (), (override));
  MOCK_METHOD(int32_t, CaptureSettings, (webrtc::VideoCaptureCapability&),
              (override));
  MOCK_METHOD(int32_t, SetCaptureRotation, (webrtc::VideoRotation), (override));
  MOCK_METHOD(bool, SetApplyRotation, (bool), (override));
  MOCK_METHOD(bool, GetApplyRotation, (), (override));

  MockVideoCapturer() {
    ON_CALL(*this,
            RegisterCaptureDataCallback(
                Matcher<webrtc::VideoSinkInterface<webrtc::VideoFrame>*>(_)))
        .WillByDefault(Return());
    ON_CALL(*this, DeRegisterCaptureDataCallback).WillByDefault(Return());
    ON_CALL(*this, StartCapture).WillByDefault(Return(0));
    ON_CALL(*this, StopCapture).WillByDefault(Return(0));
  }
};

class MockVideoCaptureFactory : public VideoCaptureFactory {
 public:
  MOCK_METHOD(std::shared_ptr<VideoCaptureModule::DeviceInfo>, CreateDeviceInfo,
              (CaptureDeviceType), (override));
  MOCK_METHOD(VideoCaptureFactory::CreateVideoCaptureResult, CreateVideoCapture,
              (int32_t, const char*, CaptureDeviceType), (override));

  MockVideoCaptureFactory() : mDeviceInfo(std::make_shared<DeviceInfoFake>()) {
    ON_CALL(*this, CreateDeviceInfo)
        .WillByDefault([&](CaptureDeviceType aType)
                           -> std::shared_ptr<VideoCaptureModule::DeviceInfo> {
          MOZ_RELEASE_ASSERT(aType == CaptureDeviceType::Camera);
          return mDeviceInfo;
        });
    ON_CALL(*this, CreateVideoCapture)
        .WillByDefault(
            [&](int32_t aCaptureId, const char* aUniqueId,
                CaptureDeviceType aType) -> CreateVideoCaptureResult {
              MOZ_RELEASE_ASSERT(aType == CaptureDeviceType::Camera);
              auto capturer =
                  webrtc::make_ref_counted<NiceMock<MockVideoCapturer>>();
              mCapturers[aCaptureId] = capturer;
              return {.mCapturer = capturer};
            });
  }

  const std::shared_ptr<DeviceInfoFake> mDeviceInfo;
  std::map<int32_t, webrtc::scoped_refptr<MockVideoCapturer>> mCapturers;
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
  RefPtr<MockVideoCaptureFactory> mFactory =
      MakeRefPtr<NiceMock<MockVideoCaptureFactory>>();
  RefPtr<VideoEngine> mEngine = VideoEngine::Create(mDeviceType, mFactory);
  RefPtr<MockCamerasParent> mParent;
  std::unique_ptr<AggregateCapturer> mAggregator;

  void SetUp() override {
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
    mAggregator->RemoveStreamsFor(mParent);
    mAggregator = nullptr;
    mParent = nullptr;
    mEngine = nullptr;
    mFactory = nullptr;
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

TEST_F(TestAggregateCapturer, StartStream) {
  const dom::VideoResizeModeEnum resizeMode = dom::VideoResizeModeEnum::None;
  const NormalizedConstraints constraints;
  webrtc::VideoCaptureCapability cap;
  mFactory->mDeviceInfo->GetCapability(DeviceInfoFake::kId, 0, cap);

  auto capturer = mFactory->mCapturers[mAggregator->mCaptureId];
  EXPECT_CALL(*capturer, StartCapture(Eq(cap))).WillOnce(Return(0));

  mAggregator->StartStream(mAggregator->mCaptureId, cap, constraints,
                           resizeMode);
}

TEST_F(TestAggregateCapturer, StartStreamCombined) {
  const dom::VideoResizeModeEnum resizeMode = dom::VideoResizeModeEnum::None;
  const NormalizedConstraints constraints;
  webrtc::VideoCaptureCapability cap1;
  mFactory->mDeviceInfo->GetCapability(DeviceInfoFake::kId, 0, cap1);
  webrtc::VideoCaptureCapability cap2;
  mFactory->mDeviceInfo->GetCapability(DeviceInfoFake::kId, 1, cap2);

  {
    InSequence seq;
    auto capturer = mFactory->mCapturers[mAggregator->mCaptureId];
    EXPECT_CALL(*capturer, StartCapture(Eq(cap1))).WillOnce(Return(0));
    EXPECT_CALL(*capturer, StartCapture(Eq(cap2))).WillOnce(Return(0));
    EXPECT_CALL(*capturer, StartCapture(Eq(cap1))).WillOnce(Return(0));
  }

  auto otherStreamId = mEngine->GenerateId();
  mAggregator->AddStream(mParent, otherStreamId, kWindowId);
  mAggregator->StartStream(mAggregator->mCaptureId, cap1, constraints,
                           resizeMode);
  mAggregator->StartStream(otherStreamId, cap2, constraints, resizeMode);
  mAggregator->StopStream(otherStreamId);
}

TEST_F(TestAggregateCapturer, CombinedCapabilityBadType) {
  const dom::VideoResizeModeEnum resizeMode = dom::VideoResizeModeEnum::None;
  const NormalizedConstraints constraints;
  webrtc::VideoCaptureCapability cap;
  cap.width = 99999;
  cap.height = 99999;
  cap.maxFPS = 99999;
  cap.videoType = webrtc::VideoType(99999);

  auto capturer = mFactory->mCapturers[mAggregator->mCaptureId];
  webrtc::VideoCaptureCapability expectedCap;
  mFactory->mDeviceInfo->GetCapability(DeviceInfoFake::kId, 1, expectedCap);
  EXPECT_CALL(*capturer, StartCapture(Eq(expectedCap))).WillOnce(Return(0));

  mAggregator->StartStream(mAggregator->mCaptureId, cap, constraints,
                           resizeMode);
}

TEST_F(TestAggregateCapturer, FrameDelivery) {
  webrtc::VideoCaptureCapability cap;
  mFactory->mDeviceInfo->GetCapability(DeviceInfoFake::kId, 0, cap);
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
