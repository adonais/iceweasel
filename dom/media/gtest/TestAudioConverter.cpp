/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <gtest/gtest.h>

#include <limits>

#include "AudioConverter.h"

using namespace mozilla;

TEST(AudioConverterTest, ProcessRejectsResampleThatOverflowsOutputFrames)
{
  AudioConfig inputConfig(2, 1, AudioConfig::FORMAT_S16);
  AudioConfig outputConfig(2, AudioInfo::MAX_RATE, AudioConfig::FORMAT_S16);
  AudioConverter converter(inputConfig, outputConfig);

  const size_t frames =
      std::numeric_limits<uint32_t>::max() / AudioInfo::MAX_RATE + 1;
  AlignedShortBuffer input(frames * inputConfig.Channels());

  ASSERT_TRUE(input);

  auto result = converter.Process(
      AudioDataBuffer<AudioConfig::FORMAT_S16>(std::move(input)));
  EXPECT_EQ(result.Length(), 0u);
}
