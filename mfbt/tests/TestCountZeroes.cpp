/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/MathAlgorithms.h"

using mozilla::CountLeadingZeroes32;
using mozilla::CountLeadingZeroes64;

static void TestLeadingZeroes32() {
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0xF0FF1000) == 0);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x7F8F0001) == 1);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x3FFF0100) == 2);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x1FF50010) == 3);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00800000) == 8);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00400000) == 9);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00008000) == 16);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00004000) == 17);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00000080) == 24);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00000040) == 25);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes32(0x00000001) == 31);
}

static void TestLeadingZeroes64() {
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0xF000F0F010000000) == 0);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x70F080F000000001) == 1);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x30F0F0F000100000) == 2);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x10F0F05000000100) == 3);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0080000000000001) == 8);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0040000010001000) == 9);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x000080F010000000) == 16);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x000040F010000000) == 17);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000008000100100) == 24);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000004100010010) == 25);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000080100100) == 32);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000041001010) == 33);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000800100) == 40);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000411010) == 41);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000008001) == 48);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000004010) == 49);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000000081) == 56);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000000040) == 57);
  MOZ_RELEASE_ASSERT(CountLeadingZeroes64(0x0000000000000001) == 63);
}

int main() {
  TestLeadingZeroes32();
  TestLeadingZeroes64();
  return 0;
}
