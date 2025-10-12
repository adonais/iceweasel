/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstddef>
#include <utility>
#include "mozilla/MulOverflowMask.h"
#include "mozilla/Assertions.h"

template <size_t N>
constexpr bool checkMulOverflowMask(size_t X) {
  static_assert(N != 0);
  size_t M = mozilla::MulOverflowMask<N>();
  size_t cond = X & M;
  size_t prod = N * X;
  // That's the invariant specified in mozilla::MulOverflowMask documentation.
  return cond || (prod >= X);
}

template <size_t... Ns>
constexpr bool check_all(size_t X, std::index_sequence<Ns...>) {
  return (checkMulOverflowMask<Ns>(X) && ...);
}

static void TestMulOverflowMask() {
  constexpr size_t highbit = (size_t)1
                             << (std::numeric_limits<size_t>::digits - 1);
  constexpr size_t allones = (size_t)-1;

  constexpr std::index_sequence<1, 2, 3, 4, 5, 127, 128, 129, 1023, 1024,
                                113231, 3231323, highbit, highbit / 2,
                                highbit + 1, highbit - 1, allones, allones - 1,
                                allones / 2 + 1>
      Ns;

  static_assert(check_all(0, Ns));
  static_assert(check_all(1, Ns));
  static_assert(check_all(2, Ns));
  static_assert(check_all(3, Ns));
  static_assert(check_all(4, Ns));
  static_assert(check_all(5, Ns));
  static_assert(check_all(7, Ns));
  static_assert(check_all(15, Ns));
  static_assert(check_all(245, Ns));
  static_assert(check_all(13279, Ns));
  static_assert(check_all(highbit / 2, Ns));
  static_assert(check_all(highbit - 1, Ns));
  static_assert(check_all(highbit, Ns));
  static_assert(check_all(highbit + 1, Ns));
  static_assert(check_all(allones, Ns));
  static_assert(check_all(allones - 1, Ns));
}

int main() {
  TestMulOverflowMask();
  return 0;
}
