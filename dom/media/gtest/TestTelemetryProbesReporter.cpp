/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TelemetryProbesReporter.h"
#include "gtest/gtest.h"
#include "nsError.h"

using namespace mozilla;

TEST(TelemetryProbesReporter, IsSessionEndingError)
{
  // Transient conditions must not be counted as ending the session.
  EXPECT_FALSE(TelemetryProbesReporter::IsSessionEndingError(
      NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA));
  EXPECT_FALSE(TelemetryProbesReporter::IsSessionEndingError(
      NS_ERROR_DOM_MEDIA_CANCELED));

  // Genuine decode failures are session-ending.
  EXPECT_TRUE(TelemetryProbesReporter::IsSessionEndingError(
      NS_ERROR_DOM_MEDIA_DECODE_ERR));
  EXPECT_TRUE(TelemetryProbesReporter::IsSessionEndingError(
      NS_ERROR_DOM_MEDIA_FATAL_ERR));
  EXPECT_TRUE(TelemetryProbesReporter::IsSessionEndingError(
      NS_ERROR_DOM_MEDIA_MEDIA_ENGINE_INITIALIZATION_ERR));
}
