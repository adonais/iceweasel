/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/MathAlgorithms.h"

using mozilla::CountLeadingZeroes32;

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

int main() {
  TestLeadingZeroes32();
  return 0;
}
