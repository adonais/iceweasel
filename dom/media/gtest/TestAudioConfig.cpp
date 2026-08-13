/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AudioConfig.h"
#include "gtest/gtest.h"

using mozilla::AudioConfig;

// A channel index that is out of range for the channel map must produce an
// invalid layout with an UNKNOWN_MAP, rather than a bogus map.
TEST(AudioConfigChannelLayout, OutOfRangeChannelIndexIsRejected)
{
  // 32 == bit width of ChannelMap; out of range for any valid channel.
  AudioConfig::ChannelLayout layout({static_cast<AudioConfig::Channel>(32)});

  EXPECT_FALSE(layout.IsValid());
  EXPECT_EQ(layout.Map(), AudioConfig::ChannelLayout::UNKNOWN_MAP);
}
