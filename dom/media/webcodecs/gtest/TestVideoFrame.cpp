/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "2D.h"
#include "ImageContainer.h"
#include "Tools.h"
#include "gtest/gtest.h"
#include "js/ArrayBuffer.h"
#include "js/RootingAPI.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/dom/AutoEntryScript.h"
#include "mozilla/dom/BufferSourceBinding.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/RootedDictionary.h"
#include "mozilla/dom/VideoFrame.h"
#include "mozilla/dom/VideoFrameBinding.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/gfx/Rect.h"
#include "xpcpublic.h"

using namespace mozilla;
using namespace mozilla::dom;
using namespace mozilla::gfx;
using namespace mozilla::layers;

constexpr uint8_t kSentinel = 0xDE;
constexpr uint8_t kUVal = 100;
constexpr uint8_t kVVal = 200;
static uint8_t YValue(int32_t aRow, int32_t aCol) {
  return static_cast<uint8_t>((aRow * 16 + aCol) & 0xFF);
}

// Create a PlanarYCbCrImage with aligned strides, simulating what a video
// decoder produces. FFmpeg uses avcodec_align_dimensions (typically 32-byte),
// Apple VideoToolbox uses CVPixelBuffer strides (typically 64-byte on Apple
// Silicon). RecyclingPlanarYCbCrImage::CopyData preserves these strides.
static RefPtr<RecyclingPlanarYCbCrImage> CreateAlignedI420Image(
    int32_t aWidth, int32_t aHeight, int32_t aYStride, int32_t aUVStride,
    nsTArray<uint8_t>& aBuf) {
  const int32_t uvWidth = (aWidth + 1) / 2;
  const int32_t uvHeight = (aHeight + 1) / 2;

  const size_t yPlaneSize = aYStride * aHeight;
  const size_t uvPlaneSize = aUVStride * uvHeight;
  aBuf.SetLength(yPlaneSize + 2 * uvPlaneSize);
  memset(aBuf.Elements(), kSentinel, aBuf.Length());

  uint8_t* yData = aBuf.Elements();
  uint8_t* uData = aBuf.Elements() + yPlaneSize;
  uint8_t* vData = aBuf.Elements() + yPlaneSize + uvPlaneSize;

  // Write known Y values via YValue(row, col).
  for (int32_t row = 0; row < aHeight; row++) {
    for (int32_t x = 0; x < aWidth; x++) {
      yData[row * aYStride + x] = YValue(row, x);
    }
  }
  for (int32_t row = 0; row < uvHeight; row++) {
    for (int32_t x = 0; x < uvWidth; x++) {
      uData[row * aUVStride + x] = kUVal;
      vData[row * aUVStride + x] = kVVal;
    }
  }

  PlanarYCbCrData data;
  data.mPictureRect = IntRect(0, 0, aWidth, aHeight);
  data.mYChannel = yData;
  data.mYStride = aYStride;
  data.mYSkip = 0;
  data.mCbChannel = uData;
  data.mCbSkip = 0;
  data.mCrChannel = vData;
  data.mCrSkip = 0;
  data.mCbCrStride = aUVStride;
  data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  data.mYUVColorSpace = YUVColorSpace::BT709;

  auto image = MakeRefPtr<RecyclingPlanarYCbCrImage>(new BufferRecycleBin());
  EXPECT_EQ(image->CopyData(data), NS_OK);
  return image;
}

TEST(VideoFrameTest, CopyToI420AlignedStride)
{
  // Simulate a decoder-produced I420 frame with 32-byte-aligned strides
  // (matching FFmpeg's avcodec_align_dimensions). Width 48 with Y
  // bytesPerPixel=1 gives aligned stride 64 (16-byte padding per row).
  const int32_t kWidth = 48;
  const int32_t kHeight = 4;
  const int32_t kUVWidth = (kWidth + 1) / 2;
  const int32_t kYStride = GetAlignedStride<32>(kWidth, 1).value();
  const int32_t kUVStride = GetAlignedStride<32>(kUVWidth, 1).value();

  nsTArray<uint8_t> buf;
  RefPtr<RecyclingPlanarYCbCrImage> image =
      CreateAlignedI420Image(kWidth, kHeight, kYStride, kUVStride, buf);
  ASSERT_NE(image, nullptr);

  AutoJSAPI jsapi;
  MOZ_ALWAYS_TRUE(jsapi.Init(xpc::PrivilegedJunkScope()));
  JSContext* cx = jsapi.cx();
  nsCOMPtr<nsIGlobalObject> global =
      xpc::NativeGlobal(xpc::PrivilegedJunkScope());
  ASSERT_NE(global, nullptr);

  IntSize codedSize(kWidth, kHeight);
  IntRect visibleRect(0, 0, kWidth, kHeight);
  VideoColorSpaceInternal colorSpace(false, VideoMatrixCoefficients::Bt709,
                                     VideoColorPrimaries::Bt709,
                                     VideoTransferCharacteristics::Bt709);

  RefPtr<VideoFrame> frame = MakeRefPtr<VideoFrame>(
      global.get(), RefPtr<layers::Image>(image), Some(VideoPixelFormat::I420),
      codedSize, visibleRect, codedSize, Nothing(), int64_t(0), colorSpace);

  // Get the required allocation size.
  RootedDictionary<VideoFrameCopyToOptions> options(cx);
  ErrorResult rv;
  uint32_t allocSize = frame->AllocationSize(options, rv);
  ASSERT_FALSE(rv.Failed())
  << "AllocationSize failed";
  ASSERT_GT(allocSize, 0u);

  // Create a JS ArrayBuffer as the copy destination.
  JS::Rooted<JSObject*> arrayBuffer(cx, JS::NewArrayBuffer(cx, allocSize));
  ASSERT_NE(arrayBuffer.get(), nullptr);

  // Wrap in AllowSharedBufferSource via Init from a JS value.
  MaybeSharedArrayBufferOrMaybeSharedArrayBufferView bufferSource;
  JS::Rooted<JS::Value> abVal(cx, JS::ObjectValue(*arrayBuffer));
  ASSERT_TRUE(bufferSource.Init(cx, abVal));

  // Call CopyTo -- the copy is synchronous.
  RefPtr<Promise> promise = frame->CopyTo(bufferSource, options, rv);
  ASSERT_FALSE(rv.Failed())
  << "CopyTo failed";
  ASSERT_NE(promise, nullptr);

  // Read back the destination data.
  bool isShared = false;
  size_t destLen = 0;
  uint8_t* destData = nullptr;
  JS::GetArrayBufferLengthAndData(arrayBuffer, &destLen, &isShared, &destData);
  ASSERT_NE(destData, nullptr);
  ASSERT_GE(destLen, static_cast<size_t>(allocSize));

  // Verify Y plane. CopyTo writes planes with packed (width) stride into the
  // destination. Y plane is at offset 0 with stride = kWidth.
  for (int32_t row = 0; row < kHeight; row++) {
    for (int32_t x = 0; x < kWidth; x++) {
      uint8_t expected = YValue(row, x);
      uint8_t actual = destData[row * kWidth + x];
      EXPECT_EQ(actual, expected)
          << "Y mismatch at row=" << row << " col=" << x;
    }
  }

  // Verify U plane.
  const int32_t uvWidth = (kWidth + 1) / 2;
  const int32_t uvHeight = (kHeight + 1) / 2;
  const uint32_t uOffset = kWidth * kHeight;
  for (int32_t row = 0; row < uvHeight; row++) {
    for (int32_t x = 0; x < uvWidth; x++) {
      uint8_t actual = destData[uOffset + row * uvWidth + x];
      EXPECT_EQ(actual, kUVal) << "U mismatch at row=" << row << " col=" << x;
    }
  }

  // Verify V plane.
  const uint32_t vOffset = uOffset + uvWidth * uvHeight;
  for (int32_t row = 0; row < uvHeight; row++) {
    for (int32_t x = 0; x < uvWidth; x++) {
      uint8_t actual = destData[vOffset + row * uvWidth + x];
      EXPECT_EQ(actual, kVVal) << "V mismatch at row=" << row << " col=" << x;
    }
  }

  frame->Close();
}

TEST(VideoFrameTest, CopyToNV12AlignedStride)
{
  // Simulate a decoder-produced NV12 frame with 32-byte-aligned strides.
  // NV12 UV plane has interleaved U,V pairs (2 bytes per chroma sample),
  // so UV stride = GetAlignedStride<32>(uvWidth, 2).
  const int32_t kWidth = 48;
  const int32_t kHeight = 4;
  const int32_t uvWidth = (kWidth + 1) / 2;
  const int32_t uvHeight = (kHeight + 1) / 2;
  const int32_t kYStride = GetAlignedStride<32>(kWidth, 1).value();
  const int32_t kUVStride = GetAlignedStride<32>(uvWidth, 2).value();

  const size_t yPlaneSize = kYStride * kHeight;
  const size_t uvPlaneSize = kUVStride * uvHeight;
  nsTArray<uint8_t> buf;
  buf.SetLength(yPlaneSize + uvPlaneSize);
  memset(buf.Elements(), kSentinel, buf.Length());

  uint8_t* yData = buf.Elements();
  uint8_t* uvData = buf.Elements() + yPlaneSize;

  for (int32_t row = 0; row < kHeight; row++) {
    for (int32_t x = 0; x < kWidth; x++) {
      yData[row * kYStride + x] = YValue(row, x);
    }
  }
  // NV12: interleaved U,V pairs.
  for (int32_t row = 0; row < uvHeight; row++) {
    for (int32_t x = 0; x < uvWidth; x++) {
      uvData[row * kUVStride + x * 2] = kUVal;
      uvData[row * kUVStride + x * 2 + 1] = kVVal;
    }
  }

  PlanarYCbCrData data;
  data.mPictureRect = IntRect(0, 0, kWidth, kHeight);
  data.mYChannel = yData;
  data.mYStride = kYStride;
  data.mYSkip = 0;
  data.mCbChannel = uvData;
  data.mCbSkip = 1;
  data.mCrChannel = uvData + 1;
  data.mCrSkip = 1;
  data.mCbCrStride = kUVStride;
  data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  data.mYUVColorSpace = YUVColorSpace::BT709;

  auto image = MakeRefPtr<NVImage>();
  ASSERT_EQ(image->SetData(data), NS_OK);

  AutoJSAPI jsapi;
  MOZ_ALWAYS_TRUE(jsapi.Init(xpc::PrivilegedJunkScope()));
  JSContext* cx = jsapi.cx();
  nsCOMPtr<nsIGlobalObject> global =
      xpc::NativeGlobal(xpc::PrivilegedJunkScope());
  ASSERT_NE(global, nullptr);

  IntSize codedSize(kWidth, kHeight);
  IntRect visibleRect(0, 0, kWidth, kHeight);
  VideoColorSpaceInternal colorSpace(false, VideoMatrixCoefficients::Bt709,
                                     VideoColorPrimaries::Bt709,
                                     VideoTransferCharacteristics::Bt709);

  RefPtr<VideoFrame> frame = MakeRefPtr<VideoFrame>(
      global.get(), RefPtr<layers::Image>(image), Some(VideoPixelFormat::NV12),
      codedSize, visibleRect, codedSize, Nothing(), int64_t(0), colorSpace);

  RootedDictionary<VideoFrameCopyToOptions> options(cx);
  ErrorResult rv;
  uint32_t allocSize = frame->AllocationSize(options, rv);
  ASSERT_FALSE(rv.Failed());
  ASSERT_GT(allocSize, 0u);

  JS::Rooted<JSObject*> arrayBuffer(cx, JS::NewArrayBuffer(cx, allocSize));
  ASSERT_NE(arrayBuffer.get(), nullptr);

  MaybeSharedArrayBufferOrMaybeSharedArrayBufferView bufferSource;
  JS::Rooted<JS::Value> abVal(cx, JS::ObjectValue(*arrayBuffer));
  ASSERT_TRUE(bufferSource.Init(cx, abVal));

  RefPtr<Promise> promise = frame->CopyTo(bufferSource, options, rv);
  ASSERT_FALSE(rv.Failed());
  ASSERT_NE(promise, nullptr);

  bool isShared = false;
  size_t destLen = 0;
  uint8_t* destData = nullptr;
  JS::GetArrayBufferLengthAndData(arrayBuffer, &destLen, &isShared, &destData);
  ASSERT_NE(destData, nullptr);

  // Verify Y plane.
  for (int32_t row = 0; row < kHeight; row++) {
    for (int32_t x = 0; x < kWidth; x++) {
      uint8_t expected = YValue(row, x);
      uint8_t actual = destData[row * kWidth + x];
      EXPECT_EQ(actual, expected)
          << "Y mismatch at row=" << row << " col=" << x;
    }
  }

  // Verify UV plane (NV12: interleaved U,V after Y).
  const uint32_t uvOffset = kWidth * kHeight;
  const int32_t destUVStride = uvWidth * 2;
  for (int32_t row = 0; row < uvHeight; row++) {
    for (int32_t x = 0; x < uvWidth; x++) {
      uint8_t actualU = destData[uvOffset + row * destUVStride + x * 2];
      uint8_t actualV = destData[uvOffset + row * destUVStride + x * 2 + 1];
      EXPECT_EQ(actualU, kUVal) << "U mismatch at row=" << row << " col=" << x;
      EXPECT_EQ(actualV, kVVal) << "V mismatch at row=" << row << " col=" << x;
    }
  }

  frame->Close();
}

TEST(VideoFrameTest, CopyToBGRAAlignedStride)
{
  const int32_t kWidth = 5;
  const int32_t kHeight = 8;
  const int32_t kBytesPerPixel = 4;  // BGRA
  const int32_t kPackedStride = kWidth * kBytesPerPixel;
  const int32_t kAlignedStride =
      GetAlignedStride<16>(kWidth, kBytesPerPixel).value();

  // Create a BGRA surface with the aligned stride.
  RefPtr<DataSourceSurface> surface =
      Factory::CreateDataSourceSurfaceWithStride(
          IntSize(kWidth, kHeight), SurfaceFormat::B8G8R8A8, kAlignedStride);
  ASSERT_NE(surface, nullptr);

  {
    DataSourceSurface::ScopedMap map(surface, DataSourceSurface::WRITE);
    ASSERT_TRUE(map.IsMapped());
    ASSERT_EQ(map.GetStride(), kAlignedStride);

    // Fill entire buffer with sentinel so incorrect reads are detectable.
    memset(map.GetData(), kSentinel, map.GetStride() * kHeight);

    // Write known BGRA pixel values: B=row*10, G=col*20, R=128, A=255.
    uint8_t* rowPtr = map.GetData();
    for (int32_t row = 0; row < kHeight; row++) {
      for (int32_t x = 0; x < kWidth; x++) {
        rowPtr[x * kBytesPerPixel + 0] = static_cast<uint8_t>(row * 10);  // B
        rowPtr[x * kBytesPerPixel + 1] = static_cast<uint8_t>(x * 20);    // G
        rowPtr[x * kBytesPerPixel + 2] = 128;                             // R
        rowPtr[x * kBytesPerPixel + 3] = 255;                             // A
      }
      rowPtr += kAlignedStride;
    }
  }

  // Wrap in a SourceSurfaceImage (same path as canvas-backed VideoFrame).
  RefPtr<SourceSurfaceImage> image =
      new SourceSurfaceImage(IntSize(kWidth, kHeight), surface);

  AutoJSAPI jsapi;
  MOZ_ALWAYS_TRUE(jsapi.Init(xpc::PrivilegedJunkScope()));
  JSContext* cx = jsapi.cx();
  nsCOMPtr<nsIGlobalObject> global =
      xpc::NativeGlobal(xpc::PrivilegedJunkScope());
  ASSERT_NE(global, nullptr);

  IntSize codedSize(kWidth, kHeight);
  IntRect visibleRect(0, 0, kWidth, kHeight);
  VideoColorSpaceInternal colorSpace;

  RefPtr<VideoFrame> frame = MakeRefPtr<VideoFrame>(
      global.get(), RefPtr<layers::Image>(image), Some(VideoPixelFormat::BGRA),
      codedSize, visibleRect, codedSize, Nothing(), int64_t(0), colorSpace);

  RootedDictionary<VideoFrameCopyToOptions> options(cx);
  ErrorResult rv;
  uint32_t allocSize = frame->AllocationSize(options, rv);
  ASSERT_FALSE(rv.Failed())
  << "AllocationSize failed";
  ASSERT_GT(allocSize, 0u);

  JS::Rooted<JSObject*> arrayBuffer(cx, JS::NewArrayBuffer(cx, allocSize));
  ASSERT_NE(arrayBuffer.get(), nullptr);

  MaybeSharedArrayBufferOrMaybeSharedArrayBufferView bufferSource;
  JS::Rooted<JS::Value> abVal(cx, JS::ObjectValue(*arrayBuffer));
  ASSERT_TRUE(bufferSource.Init(cx, abVal));

  RefPtr<Promise> promise = frame->CopyTo(bufferSource, options, rv);
  ASSERT_FALSE(rv.Failed())
  << "CopyTo failed";
  ASSERT_NE(promise, nullptr);

  bool isShared = false;
  size_t destLen = 0;
  uint8_t* destData = nullptr;
  JS::GetArrayBufferLengthAndData(arrayBuffer, &destLen, &isShared, &destData);
  ASSERT_NE(destData, nullptr);

  // CopyTo writes packed rows (stride = kPackedStride) into the destination.
  for (int32_t row = 0; row < kHeight; row++) {
    for (int32_t x = 0; x < kWidth; x++) {
      size_t i = row * kPackedStride + x * kBytesPerPixel;
      uint8_t expectedB = static_cast<uint8_t>(row * 10);
      uint8_t expectedG = static_cast<uint8_t>(x * 20);
      uint8_t expectedR = 128;
      uint8_t expectedA = 255;

      EXPECT_EQ(destData[i + 0], expectedB)
          << "B mismatch at row=" << row << " col=" << x;
      EXPECT_EQ(destData[i + 1], expectedG)
          << "G mismatch at row=" << row << " col=" << x;
      EXPECT_EQ(destData[i + 2], expectedR)
          << "R mismatch at row=" << row << " col=" << x;
      EXPECT_EQ(destData[i + 3], expectedA)
          << "A mismatch at row=" << row << " col=" << x;
    }
  }

  frame->Close();
}
