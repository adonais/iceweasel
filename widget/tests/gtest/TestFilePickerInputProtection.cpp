/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/TimeStamp.h"
#include "nsBaseFilePicker.h"

using mozilla::TimeDuration;
using mozilla::TimeStamp;

// Tests the shared timing check used by every platform's file picker to
// ignore confirmations that arrive before the input-protection time range has
// passed.

TEST(FilePickerInputProtection, WithinTimeRangeIsProtected)
{
  TimeStamp show = TimeStamp::Now();
  TimeStamp now = show + TimeDuration::FromMilliseconds(100);
  EXPECT_TRUE(
      nsBaseFilePicker::IsWithinInputProtectionTimeRange(show, now, 500));
}

TEST(FilePickerInputProtection, PastTimeRangeIsNotProtected)
{
  TimeStamp show = TimeStamp::Now();
  TimeStamp now = show + TimeDuration::FromMilliseconds(600);
  EXPECT_FALSE(
      nsBaseFilePicker::IsWithinInputProtectionTimeRange(show, now, 500));
}

TEST(FilePickerInputProtection, BoundaryIsNotProtected)
{
  // The check uses "less than", so a confirmation exactly at the end of the
  // time range is accepted.
  TimeStamp show = TimeStamp::Now();
  TimeStamp now = show + TimeDuration::FromMilliseconds(500);
  EXPECT_FALSE(
      nsBaseFilePicker::IsWithinInputProtectionTimeRange(show, now, 500));
}

TEST(FilePickerInputProtection, ZeroProtectionDisablesTimeRange)
{
  TimeStamp show = TimeStamp::Now();
  TimeStamp now = show + TimeDuration::FromMilliseconds(1);
  EXPECT_FALSE(
      nsBaseFilePicker::IsWithinInputProtectionTimeRange(show, now, 0));
}

TEST(FilePickerInputProtection, NullShowTimeDisablesTimeRange)
{
  TimeStamp now = TimeStamp::Now();
  EXPECT_FALSE(nsBaseFilePicker::IsWithinInputProtectionTimeRange(TimeStamp(),
                                                                  now, 500));
}
