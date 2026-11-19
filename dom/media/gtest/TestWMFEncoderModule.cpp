/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/gfx/Point.h"

namespace mozilla {
// Declared here to avoid WMFDataEncoderUtils.h, which pulls in <windows.h>.
bool IsFrameSizeSupportedForNV12Input(const gfx::IntSize& aSize);
}  // namespace mozilla

using namespace mozilla;

// The rule: the NV12 buffer is laid out with a single stride of the frame
// width, so it can hold a 2 * ceil(width / 2) byte interleaved chroma row only
// when the width is even. Odd widths are therefore unsupported, whatever the
// height -- the chroma plane's height is rounded up rather than packed against
// a stride, so it never runs short.
//
// Tests the predicate rather than Supports(), which returns empty on any host
// without a VP8 or VP9 encoder and so would pass without testing anything.
TEST(WMFEncoderModule, FrameSizeSupportedForNV12Input)
{
  EXPECT_FALSE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(65, 64)));
  EXPECT_FALSE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(65, 65)));
  EXPECT_FALSE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(1, 1)));
  EXPECT_FALSE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(641, 480)));
  EXPECT_FALSE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(1921, 1080)));

  // Only the width feeds the chroma row length, so an odd height is fine.
  EXPECT_TRUE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(64, 64)));
  EXPECT_TRUE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(64, 65)));
  EXPECT_TRUE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(640, 480)));
  EXPECT_TRUE(IsFrameSizeSupportedForNV12Input(gfx::IntSize(1920, 1080)));
}
