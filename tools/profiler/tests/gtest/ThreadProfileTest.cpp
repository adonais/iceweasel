/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ProfileBuffer.h"
#include "platform.h"

#include "mozilla/PowerOfTwo.h"
#include "mozilla/ProfileBufferChunkManagerWithLocalLimit.h"
#include "mozilla/ProfileChunkedBuffer.h"

#include "gtest/gtest.h"

// Make sure we can record one entry and read it
TEST(ThreadProfile, InsertOneEntry)
{
  mozilla::ProfileBufferChunkManagerWithLocalLimit chunkManager(
      2 * (1 + uint32_t(sizeof(ProfileBufferEntry))) * 4,
      2 * (1 + uint32_t(sizeof(ProfileBufferEntry))));
  mozilla::ProfileChunkedBuffer profileChunkedBuffer(
      mozilla::ProfileChunkedBuffer::ThreadSafety::WithMutex, chunkManager);
  auto pb = std::make_unique<ProfileBuffer>(profileChunkedBuffer);
  pb->AddEntry(ProfileBufferEntry::Time(123.1));
  ProfileBufferEntry entry = pb->GetEntry(pb->BufferRangeStart());
  ASSERT_TRUE(entry.IsTime());
  ASSERT_EQ(123.1, entry.GetDouble());
}

// See if we can insert some entries
TEST(ThreadProfile, InsertEntriesNoWrap)
{
  mozilla::ProfileBufferChunkManagerWithLocalLimit chunkManager(
      100 * (1 + uint32_t(sizeof(ProfileBufferEntry))),
      100 * (1 + uint32_t(sizeof(ProfileBufferEntry))) / 4);
  mozilla::ProfileChunkedBuffer profileChunkedBuffer(
      mozilla::ProfileChunkedBuffer::ThreadSafety::WithMutex, chunkManager);
  auto pb = std::make_unique<ProfileBuffer>(profileChunkedBuffer);
  const int test_size = 50;
  for (int i = 0; i < test_size; i++) {
    pb->AddEntry(ProfileBufferEntry::Time(i));
  }
  int times = 0;
  uint64_t readPos = pb->BufferRangeStart();
  while (readPos != pb->BufferRangeEnd()) {
    ProfileBufferEntry entry = pb->GetEntry(readPos);
    readPos++;
    if (entry.GetKind() == ProfileBufferEntry::Kind::INVALID) {
      continue;
    }
    ASSERT_TRUE(entry.IsTime());
    ASSERT_EQ(times, entry.GetDouble());
    times++;
  }
  ASSERT_EQ(test_size, times);
}

// A sample with JIT return addresses can be referenced by a SameSample entry,
// but must not be copied.
TEST(ThreadProfile, DuplicateLastSampleWithJitReturnAddrs)
{
  mozilla::ProfileBufferChunkManagerWithLocalLimit chunkManager(4096, 256);
  mozilla::ProfileChunkedBuffer profileChunkedBuffer(
      mozilla::ProfileChunkedBuffer::ThreadSafety::WithMutex, chunkManager);
  auto pb = std::make_unique<ProfileBuffer>(profileChunkedBuffer);
  const ProfilerThreadId threadId = ProfilerThreadId::FromNumber(1);

  mozilla::Maybe<uint64_t> lastSample =
      mozilla::Some(pb->AddThreadIdEntry(threadId));
  pb->AddEntry(ProfileBufferEntry::Time(1.0));
  pb->AddEntry(
      ProfileBufferEntry::JitReturnAddr(reinterpret_cast<void*>(0x1000)));

  // The last sample is in the current chunk, so it is referenced, not copied.
  const uint64_t sample = *lastSample;
  ASSERT_TRUE(pb->DuplicateLastSample(threadId, 2.0, lastSample,
                                      /* aLastSampleHasJitReturnAddrs */ true,
                                      RunningTimes()));
  ASSERT_EQ(mozilla::Some(sample), lastSample);

  // Move on to a later chunk, so that duplication needs a copy.
  for (int i = 0; i < 100; i++) {
    pb->AddEntry(ProfileBufferEntry::Time(3.0));
  }

  const uint64_t rangeEnd = pb->BufferRangeEnd();
  ASSERT_FALSE(pb->DuplicateLastSample(threadId, 4.0, lastSample,
                                       /* aLastSampleHasJitReturnAddrs */ true,
                                       RunningTimes()));
  ASSERT_EQ(rangeEnd, pb->BufferRangeEnd());

  ASSERT_TRUE(pb->DuplicateLastSample(threadId, 4.0, lastSample,
                                      /* aLastSampleHasJitReturnAddrs */ false,
                                      RunningTimes()));
  ASSERT_NE(mozilla::Some(sample), lastSample);
  ASSERT_TRUE(pb->GetEntry(*lastSample).IsThreadId());
}
