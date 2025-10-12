/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* mfbt MulOverflowMask
 *
 * This lives ina seperated standalone header due to its inclusion in mozalloc.
 * */

#ifndef mozilla_MulOverflowMask_h
#define mozilla_MulOverflowMask_h

#include <limits>
#include <cstdint>

namespace mozilla {

/**
 * For the unsigned integral type size_t, compute a mask M for N such that
 * for all X, !(X & M) implies X * N will not overflow (w.r.t size_t)
 *
 * FIXME: Should be consteval once we move to C++20
 */
template <size_t N>
constexpr size_t MulOverflowMask() {
  static_assert(N != 0, "Multiplication requires at least one bit");
  if constexpr (N == 1) {
    return 0;
  } else {
    constexpr size_t highbit = size_t(1)
                               << (std::numeric_limits<size_t>::digits - 1);
    return highbit | (MulOverflowMask<N / 2 + (N & 1)>() >> 1);
  }
}

} /* namespace mozilla */

#endif /* mozilla_MulOverflowMask_h */
