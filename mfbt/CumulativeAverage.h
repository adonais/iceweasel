/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_CumulativeAverage_h
#define mozilla_CumulativeAverage_h

#include <stdint.h>

#include <limits>
#include <type_traits>

#include "mozilla/Assertions.h"

namespace mozilla {

// Computes a running (cumulative) average using the recurrence
//   mean += (value - mean) / count
// which avoids integer overflow in the accumulator.
// Built-in floating-point types guard against overflow in value - mean. For a
// user-defined T, that subtraction must be representable according to T's own
// arithmetic semantics.
template <typename T>
class CumulativeAverage {
  // Integral T truncates division, and mCount converts negative deltas to
  // uint64_t before division.
  static_assert(!std::is_integral_v<T>,
                "CumulativeAverage<T> requires a non-integral T (e.g. double); "
                "integer T truncates the running mean and corrupts negative "
                "deltas via unsigned division");

 public:
  void insert(T aValue) {
    ++mCount;
    if constexpr (std::is_floating_point_v<T>) {
      constexpr T kMax = std::numeric_limits<T>::max();
      if ((mMean < T{} && aValue > kMax + mMean) ||
          (mMean > T{} && aValue < -kMax + mMean)) {
        // Scale first when the unscaled difference would overflow.
        mMean += aValue / mCount - mMean / mCount;
        return;
      }
    }
    mMean += (aValue - mMean) / mCount;
  }

  T mean() const {
    MOZ_ASSERT(!empty());
    return mMean;
  }

  bool empty() const { return mCount == 0; }

  uint64_t count() const { return mCount; }

  void reset() {
    mMean = T{};
    mCount = 0;
  }

 private:
  T mMean{};
  uint64_t mCount = 0;
};

}  // namespace mozilla

#endif  // mozilla_CumulativeAverage_h
