/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstring>  // memcpy / memcmp

#include "ImageContainer.h"
#include "gfxPlatform.h"
#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/layers/LayersSurfaces.h"

using namespace mozilla;
using namespace mozilla::gfx;
using namespace mozilla::layers;

namespace {

enum class NVFormat { NV12, NV21 };

// Build an aWidth x aHeight NVImage in |aFormat| (NV12 or NV21) from luma |aY|
// (aWidth*aHeight bytes) followed by interleaved chroma |aUV|
// (aWidth*(aHeight/2) bytes). Returns nullptr if SetData fails.
RefPtr<NVImage> MakeNVImage(int32_t aWidth, int32_t aHeight, NVFormat aFormat,
                            const uint8_t* aY, const uint8_t* aUV) {
  const int32_t yStride = aWidth;
  const int32_t cbcrStride = aWidth;  // interleaved UV row: (width/2) pairs * 2
  const size_t ySize = size_t(yStride) * aHeight;
  const size_t uvSize = size_t(cbcrStride) * (aHeight / 2);

  auto src = std::make_unique<uint8_t[]>(ySize + uvSize);
  memcpy(src.get(), aY, ySize);
  memcpy(src.get() + ySize, aUV, uvSize);

  uint8_t* uv = src.get() + ySize;
  PlanarYCbCrData data;
  data.mPictureRect = IntRect(0, 0, aWidth, aHeight);
  data.mYChannel = src.get();
  data.mYStride = yStride;
  data.mYSkip = 0;
  data.mCbSkip = 1;
  data.mCrSkip = 1;
  data.mCbCrStride = cbcrStride;
  data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  if (aFormat == NVFormat::NV12) {
    data.mCbChannel = uv;
    data.mCrChannel = uv + 1;
  } else {
    data.mCrChannel = uv;
    data.mCbChannel = uv + 1;
  }

  RefPtr<NVImage> image = new NVImage();
  if (image->SetData(data) != NS_OK) {
    return nullptr;
  }
  return image;
}

// Serialize |aImage| to an RGB SurfaceDescriptorBuffer using a plain heap
// buffer as the output (AllocateSurfaceDescriptorBufferRgb accepts the
// uintptr_t MemoryOrShmem variant, so no Shmem/ISurfaceAllocator is needed).
// |aRgb| keeps the output alive for the duration of the call.
nsresult BuildSdb(NVImage* aImage, UniquePtr<uint8_t[]>& aRgb) {
  auto allocate = [&](uint32_t aSize) -> MemoryOrShmem {
    aRgb = std::make_unique<uint8_t[]>(aSize);
    return MemoryOrShmem(reinterpret_cast<uintptr_t>(aRgb.get()));
  };
  SurfaceDescriptorBuffer sdBuffer;
  return aImage->BuildSurfaceDescriptorBuffer(
      sdBuffer, Image::BuildSdbFlags::Default, allocate);
}

}  // namespace

// Serializing a freshly-constructed NV12 image (no cached mSourceSurface) to an
// RGB SurfaceDescriptorBuffer must not write the deinterleaved U/V planes back
// into the image's own backing store.
TEST(Layers, NVImageBuildSurfaceDescriptorBufferPreservesInput)
{
  constexpr int32_t width = 4;
  constexpr int32_t height = 4;
  constexpr size_t ySize = size_t(width) * height;
  constexpr size_t uvSize = size_t(width) * (height / 2);
  // Test data reused by the NV cases below. The Y ramp is arbitrary filler
  // (only its preservation matters). The interleaved chroma U0 V0 U1 V1 ...
  // uses U (32,34,36,38) and V (224,222,220,218) in disjoint, all-distinct
  // ranges, so deinterleaving U/V in place (regrouping to planar U0 U1 U2 U3 V0
  // V1 V2 V3) shows up as a visibly different byte sequence.
  const uint8_t y[ySize] = {0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
                            0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f};
  const uint8_t uv[uvSize] = {32, 224, 34, 222, 36, 220, 38, 218};

  RefPtr<NVImage> image = MakeNVImage(width, height, NVFormat::NV12, y, uv);
  ASSERT_TRUE(image);

  const PlanarYCbCrData* stored = image->GetData();
  const uint32_t storedSize = image->GetBufferSize();
  ASSERT_GE(storedSize, uint32_t(ySize + uvSize));
  UniquePtr<uint8_t[]> before = std::make_unique<uint8_t[]>(storedSize);
  memcpy(before.get(), stored->mYChannel, storedSize);

  UniquePtr<uint8_t[]> rgb;
  ASSERT_EQ(BuildSdb(image, rgb), NS_OK);

  EXPECT_EQ(0, memcmp(before.get(), stored->mYChannel, storedSize))
      << "BuildSurfaceDescriptorBuffer mutated the NV12 image's own backing "
         "store (deinterleaved U/V written back into the source).";
  EXPECT_EQ(0, memcmp(before.get() + ySize, stored->mYChannel + ySize, uvSize))
      << "Interleaved UV plane was overwritten in place.";
}

// The NV21 branch inherits the same mis-directed chroma destinations as NV12,
// so serializing a freshly-constructed NV21 image must likewise leave its
// backing store unchanged.
TEST(Layers, NVImageBuildSurfaceDescriptorBufferPreservesInputNV21)
{
  constexpr int32_t width = 4;
  constexpr int32_t height = 4;
  constexpr size_t ySize = size_t(width) * height;
  constexpr size_t uvSize = size_t(width) * (height / 2);
  const uint8_t y[ySize] = {0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
                            0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f};
  const uint8_t uv[uvSize] = {32, 224, 34, 222, 36, 220, 38, 218};

  RefPtr<NVImage> image = MakeNVImage(width, height, NVFormat::NV21, y, uv);
  ASSERT_TRUE(image);

  const PlanarYCbCrData* stored = image->GetData();
  const uint32_t storedSize = image->GetBufferSize();
  ASSERT_GE(storedSize, uint32_t(ySize + uvSize));
  UniquePtr<uint8_t[]> before = std::make_unique<uint8_t[]>(storedSize);
  memcpy(before.get(), stored->mYChannel, storedSize);

  UniquePtr<uint8_t[]> rgb;
  ASSERT_EQ(BuildSdb(image, rgb), NS_OK);

  EXPECT_EQ(0, memcmp(before.get(), stored->mYChannel, storedSize))
      << "BuildSurfaceDescriptorBuffer mutated the NV21 image's own backing "
         "store.";
  EXPECT_EQ(0, memcmp(before.get() + ySize, stored->mYChannel + ySize, uvSize))
      << "Interleaved VU plane was overwritten in place.";
}

// GetAsSourceSurface must not mutate the source, and once it caches
// mSourceSurface a subsequent BuildSurfaceDescriptorBuffer must take the
// cached-surface path and also leave the source untouched.
TEST(Layers, NVImageGetAsSourceSurfacePreservesInput)
{
  constexpr int32_t width = 4;
  constexpr int32_t height = 4;
  constexpr size_t ySize = size_t(width) * height;
  constexpr size_t uvSize = size_t(width) * (height / 2);
  const uint8_t y[ySize] = {0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
                            0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f};
  const uint8_t uv[uvSize] = {32, 224, 34, 222, 36, 220, 38, 218};

  RefPtr<NVImage> image = MakeNVImage(width, height, NVFormat::NV12, y, uv);
  ASSERT_TRUE(image);

  const PlanarYCbCrData* stored = image->GetData();
  const uint32_t storedSize = image->GetBufferSize();
  ASSERT_GE(storedSize, uint32_t(ySize + uvSize));
  UniquePtr<uint8_t[]> before = std::make_unique<uint8_t[]>(storedSize);
  memcpy(before.get(), stored->mYChannel, storedSize);

  RefPtr<gfx::SourceSurface> surface = image->GetAsSourceSurface();
  ASSERT_TRUE(surface);
  EXPECT_EQ(0, memcmp(before.get(), stored->mYChannel, storedSize))
      << "GetAsSourceSurface mutated the NV12 image's own backing store.";

  UniquePtr<uint8_t[]> rgb;
  ASSERT_EQ(BuildSdb(image, rgb), NS_OK);
  EXPECT_EQ(0, memcmp(before.get(), stored->mYChannel, storedSize))
      << "BuildSurfaceDescriptorBuffer mutated the backing store on the "
         "cached-surface path.";
}
