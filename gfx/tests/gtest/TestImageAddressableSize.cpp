/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <iterator>
#include <limits>

#include "ImageContainer.h"
#include "gtest/gtest.h"
#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/layers/BufferTexture.h"
#include "mozilla/layers/TextureClient.h"
#include "mozilla/layers/TextureWrapperImage.h"

using mozilla::ImageFormat;
using mozilla::MakeRefPtr;
using mozilla::Maybe;
using mozilla::gfx::BackendType;
using mozilla::gfx::ColorSpace2;
using mozilla::gfx::Factory;
using mozilla::gfx::IntPoint;
using mozilla::gfx::IntRect;
using mozilla::gfx::IntSize;
using mozilla::gfx::SurfaceFormat;
using mozilla::gfx::TransferFunction;
using mozilla::layers::ALLOC_DEFAULT;
using mozilla::layers::BufferTextureData;
using mozilla::layers::Image;
using mozilla::layers::LayersBackend;
using mozilla::layers::SourceSurfaceImage;
using mozilla::layers::TextureClient;
using mozilla::layers::TextureFlags;
using mozilla::layers::TextureWrapperImage;

namespace {

class GeometryImage final : public Image {
 public:
  GeometryImage(IntSize aSize, IntRect aPictureRect)
      : Image(nullptr, ImageFormat::MOZ2D_SURFACE),
        mSize(aSize),
        mPictureRect(aPictureRect) {}

  IntSize GetSize() const override { return mSize; }
  IntRect GetPictureRect() const override { return mPictureRect; }
  already_AddRefed<mozilla::gfx::SourceSurface> GetAsSourceSurface() override {
    return nullptr;
  }

 private:
  ~GeometryImage() override = default;

  const IntSize mSize;
  const IntRect mPictureRect;
};

TEST(ImageAddressableSize, BaseImageRequiresContainedPicture)
{
  constexpr IntSize kAddressableSize(320, 240);
  const IntRect kContainedPictureRect(16, 16, 288, 208);

  struct TestCase {
    IntSize mSize;
    IntRect mPictureRect;
    Maybe<IntSize> mExpected;
  };
  const TestCase cases[] = {
      {kAddressableSize, IntRect(IntPoint(), kAddressableSize),
       mozilla::Some(kAddressableSize)},
      {kAddressableSize, kContainedPictureRect,
       mozilla::Some(kAddressableSize)},
      {kContainedPictureRect.Size(), kContainedPictureRect, mozilla::Nothing()},
      {kAddressableSize, IntRect(-1, 0, 1, 1), mozilla::Nothing()},
      {kAddressableSize, IntRect(0, -1, 1, 1), mozilla::Nothing()},
      {kAddressableSize, IntRect(0, 0, 0, 1), mozilla::Nothing()},
      {kAddressableSize, IntRect(0, 0, 1, -1), mozilla::Nothing()},
      {IntSize(0, 240), IntRect(0, 0, 1, 1), mozilla::Nothing()},
      {IntSize(-1, 240), IntRect(0, 0, 1, 1), mozilla::Nothing()},
      {IntSize(std::numeric_limits<int32_t>::max(), 1),
       IntRect(std::numeric_limits<int32_t>::max() - 1, 0, 4, 1),
       mozilla::Nothing()},
  };

  for (size_t i = 0; i < std::size(cases); ++i) {
    SCOPED_TRACE(i);
    auto image =
        MakeRefPtr<GeometryImage>(cases[i].mSize, cases[i].mPictureRect);
    EXPECT_EQ(image->GetAddressableSize(), cases[i].mExpected);
  }
}

TEST(ImageAddressableSize, SourceSurfaceUsesSurfaceSize)
{
  constexpr IntSize size(320, 240);
  RefPtr<mozilla::gfx::DataSourceSurface> surface =
      Factory::CreateDataSourceSurface(size, SurfaceFormat::B8G8R8A8);
  ASSERT_TRUE(surface);
  auto image = MakeRefPtr<SourceSurfaceImage>(surface.get());
  EXPECT_EQ(image->GetAddressableSize(), mozilla::Some(size));
}

TEST(ImageAddressableSize, TextureWrapperRequiresContainedPicture)
{
  constexpr IntPoint kPictureOrigin(16, 16);
  constexpr IntSize kPictureSize(304, 208);
  constexpr IntSize kTextureSize(kPictureOrigin.x + kPictureSize.width,
                                 kPictureOrigin.y + kPictureSize.height);
  const IntRect kPictureRect(kPictureOrigin, kPictureSize);
  const IntRect kOnePixelPastRight(
      kPictureOrigin, IntSize(kPictureSize.width + 1, kPictureSize.height));
  const IntRect kOnePixelPastBottom(
      kPictureOrigin, IntSize(kPictureSize.width, kPictureSize.height + 1));

  BufferTextureData* textureData = BufferTextureData::Create(
      kTextureSize, SurfaceFormat::B8G8R8A8, ColorSpace2::SRGB,
      TransferFunction::SRGB, BackendType::CAIRO, LayersBackend::LAYERS_NONE,
      TextureFlags::DEALLOCATE_CLIENT, ALLOC_DEFAULT, nullptr);
  ASSERT_NE(textureData, nullptr);
  RefPtr<TextureClient> texture =
      new TextureClient(textureData, TextureFlags::DEALLOCATE_CLIENT, nullptr);

  auto valid = MakeRefPtr<TextureWrapperImage>(texture.get(), kPictureRect);
  EXPECT_EQ(valid->GetAddressableSize(), mozilla::Some(kTextureSize));

  auto pastRight =
      MakeRefPtr<TextureWrapperImage>(texture.get(), kOnePixelPastRight);
  EXPECT_EQ(pastRight->GetAddressableSize(), mozilla::Nothing());

  auto pastBottom =
      MakeRefPtr<TextureWrapperImage>(texture.get(), kOnePixelPastBottom);
  EXPECT_EQ(pastBottom->GetAddressableSize(), mozilla::Nothing());
}

}  // namespace
