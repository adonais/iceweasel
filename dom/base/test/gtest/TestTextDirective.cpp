/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TextDirectiveUtil.h"
#include "gtest/gtest.h"

using namespace mozilla::dom;

TEST(TestTextDirective, ComputeWordBoundaryDistancesLTR)
{
  nsString text(u"Hello, world! This is a test.");
  nsTArray<uint32_t> wordEndDistances =
      TextDirectiveUtil::ComputeWordBoundaryDistances<TextScanDirection::Right>(
          text);
  EXPECT_EQ(wordEndDistances.Length(), 7u);
  EXPECT_EQ(wordEndDistances[0], 5u);   // "Hello"
  EXPECT_EQ(wordEndDistances[1], 12u);  // "Hello, world"
  EXPECT_EQ(wordEndDistances[2], 18u);  // "Hello, world! This"
  EXPECT_EQ(wordEndDistances[3], 21u);  // "Hello, world! This is"
  EXPECT_EQ(wordEndDistances[4], 23u);  // "Hello, world! This is a"
  EXPECT_EQ(wordEndDistances[5], 28u);  // "Hello, world! This is a test"
  EXPECT_EQ(wordEndDistances[6], 29u);  // "Hello, world! This is a test."
}

TEST(TestTextDirective, ComputeWordBoundaryDistancesRTL)
{
  nsString text(u"Hello, world! This is a test.");
  nsTArray<uint32_t> wordBeginDistances =
      TextDirectiveUtil::ComputeWordBoundaryDistances<TextScanDirection::Left>(
          text);
  EXPECT_EQ(wordBeginDistances.Length(), 6u);
  EXPECT_EQ(wordBeginDistances[0], 5u);   // "test."
  EXPECT_EQ(wordBeginDistances[1], 7u);   // "a test."
  EXPECT_EQ(wordBeginDistances[2], 10u);  // "is a test."
  EXPECT_EQ(wordBeginDistances[3], 15u);  // "This is a test."
  EXPECT_EQ(wordBeginDistances[4], 22u);  // "world! This is a test."
  EXPECT_EQ(wordBeginDistances[5], 29u);  // "Hello, world! This is a test."
}

TEST(TestTextDirective, ComputeWordBoundaryDistancesPunctuationOnly)
{
  nsString text(u": , .");
  nsTArray<uint32_t> wordEndDistances =
      TextDirectiveUtil::ComputeWordBoundaryDistances<TextScanDirection::Right>(
          text);
  EXPECT_EQ(wordEndDistances.Length(), 1u);
  EXPECT_EQ(wordEndDistances[0], 5u);
}

TEST(TestTextDirective, ComputeWordBoundaryDistancesWithEmptyString)
{
  nsString text(u"");
  nsTArray<uint32_t> wordEndDistances =
      TextDirectiveUtil::ComputeWordBoundaryDistances<TextScanDirection::Right>(
          text);
  EXPECT_EQ(wordEndDistances.Length(), 1u);
  EXPECT_EQ(wordEndDistances[0], 0u);
}
