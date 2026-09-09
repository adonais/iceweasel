/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <CoreGraphics/CGColorSpace.h>
#include <CoreVideo/CVPixelBuffer.h>

#include "AppleVTColorSpace.h"
#include "MP4Demuxer.h"
#include "MacIOSurfaceImage.h"
#include "MockMediaResource.h"
#include "PDMFactory.h"
#include "VideoUtils.h"
#include "gfxPlatform.h"
#include "gtest/gtest.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/SharedThreadPool.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/gfx/MacIOSurface.h"
#include "mozilla/gtest/ScopedPrefSetter.h"
#include "mozilla/gtest/WaitFor.h"

using namespace mozilla;

// Decode the first frame of aFileName through VideoToolbox and hand back the
// IOSurface the compositor would receive. Returns nullptr when VideoToolbox
// declines the codec on this machine, so callers can skip.
static RefPtr<MacIOSurface> DecodeFirstFrameViaVideoToolbox(
    const char* aFileName) {
  gfxPlatform::GetPlatform();

  RefPtr<MockMediaResource> resource = new MockMediaResource(aFileName);
  if (NS_FAILED(resource->Open())) {
    ADD_FAILURE() << "Failed to open " << aFileName;
    return nullptr;
  }

  RefPtr<MP4Demuxer> demuxer = new MP4Demuxer(resource);
  RefPtr<TaskQueue> taskQueue = TaskQueue::Create(
      GetMediaThreadPool(MediaThreadType::SUPERVISOR), "TestAppleVTColorSpace");
  auto shutdownTaskQueue = MakeScopeExit([&] {
    taskQueue->BeginShutdown();
    taskQueue->AwaitShutdownAndIdle();
  });

  WaitForResolve(
      InvokeAsync(taskQueue, __func__, [demuxer] { return demuxer->Init(); }));
  RefPtr<MediaTrackDemuxer> track =
      demuxer->GetTrackDemuxer(TrackInfo::kVideoTrack, 0);
  UniquePtr<TrackInfo> trackInfo = track ? track->GetInfo() : nullptr;
  if (!trackInfo || !trackInfo->GetAsVideoInfo()) {
    ADD_FAILURE() << "Missing video track in " << aFileName;
    return nullptr;
  }

  // VideoToolbox reorders, so one sample in does not mean one frame out.
  auto samples = WaitFor(InvokeAsync(
      taskQueue, __func__, [track] { return track->GetSamples(16); }));
  if (samples.isErr() || samples.inspect()->GetSamples().IsEmpty()) {
    ADD_FAILURE() << "Failed to demux a sample from " << aFileName;
    return nullptr;
  }

  ScopedPrefSetter gpuProcessDecoder("media.gpu-process-decoder", false);
  ScopedPrefSetter rddProcess("media.rdd-process.enabled", false);
  ScopedPrefSetter utilityProcess("media.utility-process.enabled", false);
  RefPtr<PDMFactory> factory = MakeRefPtr<PDMFactory>();

  RefPtr<layers::ImageContainer> imageContainer =
      MakeRefPtr<layers::ImageContainer>(
          layers::ImageUsageType::VideoFrameContainer,
          layers::ImageContainer::ASYNCHRONOUS);
  auto created = WaitFor(factory->CreateDecoder(CreateDecoderParams{
      *trackInfo->GetAsVideoInfo(), imageContainer.get(),
      CreateDecoderParams::WrapperSet({/* No wrapper */})}));
  if (created.isErr()) {
    return nullptr;
  }
  RefPtr<MediaDataDecoder> decoder = created.unwrap();
  auto shutdownDecoder =
      MakeScopeExit([&] { WaitForResolve(decoder->Shutdown()); });
  if (!StringBeginsWith(decoder->GetDescriptionName(), "apple"_ns)) {
    return nullptr;
  }

  auto init = WaitFor(decoder->Init());
  if (init.isErr()) {
    ADD_FAILURE() << "Failed to initialize the VideoToolbox decoder";
    return nullptr;
  }

  RefPtr<VideoData> first;
  for (const RefPtr<MediaRawData>& sample : samples.inspect()->GetSamples()) {
    auto decoded = WaitFor(decoder->Decode(sample.get()));
    if (decoded.isErr()) {
      ADD_FAILURE() << "Failed to decode a frame from " << aFileName;
      return nullptr;
    }
    if (!decoded.inspect().IsEmpty()) {
      first = decoded.inspect()[0]->As<VideoData>();
      break;
    }
  }
  if (!first) {
    auto drained = WaitFor(decoder->Drain());
    if (drained.isErr() || drained.inspect().IsEmpty()) {
      ADD_FAILURE() << "No frame decoded from " << aFileName;
      return nullptr;
    }
    first = drained.inspect()[0]->As<VideoData>();
  }

  VideoData* video = first.get();
  if (!video || !video->mImage || !video->mImage->AsMacIOSurfaceImage()) {
    return nullptr;
  }
  return video->mImage->AsMacIOSurfaceImage()->GetSurface();
}

// A decoded frame must reach the compositor carrying its own colour
// description: IsHDRSurface(), and with it the compositor's extended dynamic
// range opt-in, is derived from the transfer function alone.
TEST(AppleVTColorSpace, SdrFrameCarriesItsColorDescription)
{
  RefPtr<MacIOSurface> surface =
      DecodeFirstFrameViaVideoToolbox("test_hevc_open_gop.mp4");
  if (!surface) {
    GTEST_SKIP() << "VideoToolbox HEVC decode unavailable here";
  }
  EXPECT_EQ(surface->GetTransferFunction(), gfx::TransferFunction::BT709);
  EXPECT_FALSE(surface->IsHDRSurface());
}

TEST(AppleVTColorSpace, PqFrameCarriesItsColorDescription)
{
  RefPtr<MacIOSurface> surface = DecodeFirstFrameViaVideoToolbox(
      "720p.png.bt2020.pq.tv.yuv420p10.hevc.mp4");
  if (!surface) {
    GTEST_SKIP() << "VideoToolbox 10 bit HEVC decode unavailable here";
  }
  EXPECT_EQ(surface->GetTransferFunction(), gfx::TransferFunction::PQ);
  EXPECT_EQ(surface->mColorPrimaries, gfx::ColorSpace2::BT2020);
}

// Whether the buffer ends up with an attached colorspace is only observable on
// the CVPixelBuffer: CVBufferSetAttachment writes the CVBuffer's attachments
// and propagates to buffers derived from it, and never touches the
// IOSurfaceColorSpace value VideoToolbox stamped on the backing surface. So
// exercise the attachment on a buffer of our own rather than a decoded frame.
static bool AttachesColorSpace(gfx::TransferFunction aTransferFunction,
                               gfx::ColorSpace2 aColorPrimaries) {
  CVPixelBufferRef raw = nullptr;
  if (CVPixelBufferCreate(kCFAllocatorDefault, 16, 16,
                          kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                          nullptr, &raw) != kCVReturnSuccess) {
    ADD_FAILURE() << "Failed to create a CVPixelBuffer";
    return false;
  }
  auto buffer = CFTypeRefPtr<CVPixelBufferRef>::WrapUnderCreateRule(raw);

  EXPECT_EQ(CVBufferGetAttachment(buffer.get(), kCVImageBufferCGColorSpaceKey,
                                  nullptr),
            nullptr);
  bool attached =
      MaybeAttachCGColorSpace(buffer.get(), aTransferFunction, aColorPrimaries);
  bool present =
      CVBufferGetAttachment(buffer.get(), kCVImageBufferCGColorSpaceKey,
                            nullptr) != nullptr;
  EXPECT_EQ(attached, present);
  return present;
}

// Ordinary SDR video keeps the colorspace VideoToolbox gave the buffer:
// CoreAnimation colour matches through an attached colorspace in preference to
// the surface's individual colour keys, so attaching one here would substitute
// a different EOTF and shift the gamma.
TEST(AppleVTColorSpace, SdrFrameGetsNoColorSpaceAttachment)
{
  EXPECT_FALSE(AttachesColorSpace(gfx::TransferFunction::BT709,
                                  gfx::ColorSpace2::BT709));
}

// The converse: VideoToolbox does not reliably describe HDR and wide gamut
// buffers to match their own transfer function, so those get an explicit one.
TEST(AppleVTColorSpace, HdrFrameGetsColorSpaceAttachment)
{
  EXPECT_TRUE(
      AttachesColorSpace(gfx::TransferFunction::PQ, gfx::ColorSpace2::BT2020));
  EXPECT_TRUE(AttachesColorSpace(gfx::TransferFunction::BT709,
                                 gfx::ColorSpace2::BT2020));
}

// Exhaustive over every colour description a decoded frame can carry. The rule
// is that HDR transfer functions and wide gamut primaries get an explicit
// colorspace and everything else keeps VideoToolbox's, so enumerate the whole
// cross product rather than the handful of combinations codecs happen to emit.
TEST(AppleVTColorSpace, ColorSpaceNameForEveryColorDescription)
{
  constexpr gfx::TransferFunction kTransferFunctions[] = {
      gfx::TransferFunction::BT709, gfx::TransferFunction::SRGB,
      gfx::TransferFunction::PQ, gfx::TransferFunction::HLG,
      gfx::TransferFunction::LINEAR};

  for (auto transfer : kTransferFunctions) {
    for (auto primaries = gfx::ColorSpace2::_First;
         primaries <= gfx::ColorSpace2::_Last;
         primaries = static_cast<gfx::ColorSpace2>(
             static_cast<uint8_t>(primaries) + 1)) {
      CFStringRef actual = CGColorSpaceNameForFrame(transfer, primaries);
      SCOPED_TRACE(testing::Message()
                   << "transfer=" << static_cast<int>(transfer)
                   << " primaries=" << static_cast<int>(primaries));

      CFStringRef expected = nullptr;
      if (__builtin_available(macOS 11.0, *)) {
        if (transfer == gfx::TransferFunction::PQ) {
          expected = kCGColorSpaceITUR_2100_PQ;
        } else if (transfer == gfx::TransferFunction::HLG) {
          expected = kCGColorSpaceITUR_2100_HLG;
        }
      }
      if (!expected && primaries == gfx::ColorSpace2::BT2020) {
        expected = kCGColorSpaceITUR_2020;
      }

      if (!expected) {
        EXPECT_EQ(actual, nullptr);
      } else {
        ASSERT_NE(actual, nullptr);
        EXPECT_TRUE(CFEqual(actual, expected));
      }
    }
  }
}

// Ordinary SDR video must reach the compositor with the colorspace
// VideoToolbox gave it.
TEST(AppleVTColorSpace, Bt709SdrGetsNoColorSpaceName)
{
  EXPECT_EQ(CGColorSpaceNameForFrame(gfx::TransferFunction::BT709,
                                     gfx::ColorSpace2::BT709),
            nullptr);
  EXPECT_EQ(CGColorSpaceNameForFrame(gfx::TransferFunction::SRGB,
                                     gfx::ColorSpace2::SRGB),
            nullptr);
}

// ...while HDR and wide gamut still get one.
TEST(AppleVTColorSpace, HdrAndWideGamutKeepColorSpaceName)
{
  if (__builtin_available(macOS 11.0, *)) {
    EXPECT_TRUE(CFEqual(CGColorSpaceNameForFrame(gfx::TransferFunction::PQ,
                                                 gfx::ColorSpace2::BT2020),
                        kCGColorSpaceITUR_2100_PQ));
    EXPECT_TRUE(CFEqual(CGColorSpaceNameForFrame(gfx::TransferFunction::HLG,
                                                 gfx::ColorSpace2::BT2020),
                        kCGColorSpaceITUR_2100_HLG));
  }
  EXPECT_TRUE(CFEqual(CGColorSpaceNameForFrame(gfx::TransferFunction::BT709,
                                               gfx::ColorSpace2::BT2020),
                      kCGColorSpaceITUR_2020));
}
