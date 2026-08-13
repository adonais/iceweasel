/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VideoSegment.h"
#include "gtest/gtest.h"

using namespace mozilla;

namespace mozilla::layer {
class Image;
}  // namespace mozilla::layer

TEST(VideoSegment, TestAppendFrameForceBlack)
{
  RefPtr<layers::Image> testImage = nullptr;

  VideoSegment segment;
  segment.AppendFrame(testImage.forget(), mozilla::gfx::IntSize(640, 480),
                      PRINCIPAL_HANDLE_NONE, true);

  VideoSegment::ChunkIterator iter(segment);
  while (!iter.IsEnded()) {
    VideoChunk chunk = *iter;
    EXPECT_TRUE(chunk.mFrame.GetForceBlack());
    iter.Next();
  }
}

TEST(VideoSegment, TestAppendFrameNotForceBlack)
{
  RefPtr<layers::Image> testImage = nullptr;

  VideoSegment segment;
  segment.AppendFrame(testImage.forget(), mozilla::gfx::IntSize(640, 480),
                      PRINCIPAL_HANDLE_NONE);

  VideoSegment::ChunkIterator iter(segment);
  while (!iter.IsEnded()) {
    VideoChunk chunk = *iter;
    EXPECT_FALSE(chunk.mFrame.GetForceBlack());
    iter.Next();
  }
}

TEST(VideoSegment, TestBlackImageSize)
{
  // Helper: return a layers::Image by creating a VideoFrame with the given
  // intrinsic size and call CloneAsBlackImage(), which generates an image at
  // the intrinsic size.
  auto makeBlackImage = [](mozilla::gfx::IntSize aSize) {
    VideoFrame frame(/*aImage=*/nullptr, aSize);
    return frame.CloneAsBlackImage();
  };

  // Valid size should produce an image of the same size.
  {
    const mozilla::gfx::IntSize size(640, 480);
    RefPtr<layers::Image> img = makeBlackImage(size);
    ASSERT_NE(img, nullptr);
    EXPECT_EQ(img->GetSize(), size);
  }

  // Zero dimensions should fail.
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(0, 480))}, nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(640, 0))}, nullptr);

  // Negative dimensions should fail.
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(-1, 480))}, nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(640, -1))}, nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(-640, -480))}, nullptr);

  // Boundary: exactly 16K should succeed.
  EXPECT_NE(RefPtr{makeBlackImage(mozilla::gfx::IntSize(16384, 480))}, nullptr);
  EXPECT_NE(RefPtr{makeBlackImage(mozilla::gfx::IntSize(640, 16384))}, nullptr);
  EXPECT_NE(RefPtr{makeBlackImage(mozilla::gfx::IntSize(16384, 16384))},
            nullptr);

  // Boundary: one over 16K should fail.
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(16384 + 1, 480))},
            nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(640, 16384 + 1))},
            nullptr);

  // Overflowing dimensions should fail.
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(INT_MAX, 480))},
            nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(640, INT_MAX))},
            nullptr);
  EXPECT_EQ(RefPtr{makeBlackImage(mozilla::gfx::IntSize(INT_MAX, INT_MAX))},
            nullptr);

  // Non-null image: CloneAsBlackImage() uses the intrinsic size, not the
  // underlying image's pixel size.
  {
    RefPtr<layers::Image> img = makeBlackImage(mozilla::gfx::IntSize(640, 480));
    ASSERT_NE(img, nullptr);

    // Wrap it in a frame with different intrinsic size.
    mozilla::gfx::IntSize intrinsicSize(320, 240);
    VideoFrame frame(img.forget(), intrinsicSize);
    RefPtr<layers::Image> result = frame.CloneAsBlackImage();
    ASSERT_NE(result, nullptr);
    EXPECT_EQ(result->GetSize(), intrinsicSize);
  }

  // Non-null image is ignored when the intrinsic size is invalid.
  {
    RefPtr<layers::Image> img = makeBlackImage(mozilla::gfx::IntSize(320, 240));
    ASSERT_NE(img, nullptr);

    VideoFrame frame(img.forget(), mozilla::gfx::IntSize(0, 0));
    EXPECT_EQ(RefPtr{frame.CloneAsBlackImage()}, nullptr);
  }
}
