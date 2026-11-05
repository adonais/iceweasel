/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GFX_TESTS_GTEST_YCBCRTESTHELPERS_H_
#define GFX_TESTS_GTEST_YCBCRTESTHELPERS_H_

#include <cstdint>

#include "mozilla/Assertions.h"

// Extent of a half-resolution chroma plane for a luma extent of aValue.
inline int32_t CeilingOfHalf(int32_t aValue) {
  MOZ_ASSERT(aValue >= 0);
  return aValue / 2 + (aValue % 2);
}

#endif  // GFX_TESTS_GTEST_YCBCRTESTHELPERS_H_
