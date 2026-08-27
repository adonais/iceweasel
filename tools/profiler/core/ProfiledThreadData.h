/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ProfiledThreadData_h
#define ProfiledThreadData_h

#include "platform.h"
#include "ProfileBuffer.h"
#include "ProfileBufferEntry.h"

#include "mozilla/FailureLatch.h"
#include "mozilla/Maybe.h"
#include "mozilla/NotNull.h"
#include "mozilla/ProfileJSONWriter.h"
#include "mozilla/ProfilerThreadRegistrationInfo.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/Vector.h"
#include "nsStringFwd.h"

class nsIEventTarget;
class ProfilerCodeAddressService;
struct JSContext;
struct ThreadStreamingContext;

// This class contains information about a thread that is only relevant while
// the profiler is running, for any threads (both alive and dead) whose thread
// name matches the "thread filter" in the current profiler run.
// ProfiledThreadData objects may be kept alive even after the thread is
// unregistered, as long as there is still data for that thread in the profiler
// buffer.
//
// Accesses to this class are protected by the profiler state lock.
//
// Created as soon as the following are true for the thread:
//  - The profiler is running, and
//  - the thread matches the profiler's thread filter, and
//  - the thread is registered with the profiler.
// So it gets created in response to either (1) the profiler being started (for
// an existing registered thread) or (2) the thread being registered (if the
// profiler is already running).
//
// The thread may be unregistered during the lifetime of ProfiledThreadData.
// If that happens, NotifyUnregistered() is called.
//
// This class is the right place to store buffer positions. Profiler buffer
// positions become invalid if the profiler buffer is destroyed, which happens
// when the profiler is stopped.
class ProfiledThreadData final {
 public:
  explicit ProfiledThreadData(
      const mozilla::profiler::ThreadRegistrationInfo& aThreadInfo);
  explicit ProfiledThreadData(
      mozilla::profiler::ThreadRegistrationInfo&& aThreadInfo);
  ~ProfiledThreadData();

  void NotifyUnregistered(uint64_t aBufferPosition) {
    mLastSample = mozilla::Nothing();
    MOZ_ASSERT(!mBufferPositionWhenReceivedJSContext,
               "JSContext should have been cleared before the thread was "
               "unregistered");
    mUnregisterTime = mozilla::TimeStamp::Now();
    mBufferPositionWhenUnregistered = mozilla::Some(aBufferPosition);
    mPreviousThreadRunningTimes.Clear();
  }
  mozilla::Maybe<uint64_t> BufferPositionWhenUnregistered() {
    return mBufferPositionWhenUnregistered;
  }

  mozilla::Maybe<uint64_t>& LastSample() { return mLastSample; }

  mozilla::NotNull<mozilla::UniquePtr<UniqueStacks>> PrepareUniqueStacks(
      const ProfileBuffer& aBuffer, JSContext* aCx,
      mozilla::FailureLatch& aFailureLatch,
      ProfilerCodeAddressService* aService,
      mozilla::ProgressLogger aProgressLogger,
      const nsTHashMap<SourceId, IndexIntoSourceTable>* aSourceIdToIndexMap =
          nullptr);

  void StreamJSON(const ProfileBuffer& aBuffer, JSContext* aCx,
                  SpliceableJSONWriter& aWriter, const nsACString& aProcessName,
                  const nsACString& aETLDplus1,
                  const mozilla::TimeStamp& aProcessStartTime,
                  double aSinceTime, ProfilerCodeAddressService* aService,
                  mozilla::ProgressLogger aProgressLogger);
  void StreamJSON(ThreadStreamingContext&& aThreadStreamingContext,
                  SpliceableJSONWriter& aWriter, const nsACString& aProcessName,
                  const nsACString& aETLDplus1,
                  const mozilla::TimeStamp& aProcessStartTime,
                  ProfilerCodeAddressService* aService,
                  mozilla::ProgressLogger aProgressLogger);

  const mozilla::profiler::ThreadRegistrationInfo& Info() const {
    return mThreadInfo;
  }

  void NotifyReceivedJSContext(uint64_t aCurrentBufferPosition) {
    mBufferPositionWhenReceivedJSContext =
        mozilla::Some(aCurrentBufferPosition);
  }

  // Call this method when the JS entries inside the buffer are about to
  // become invalid, i.e., just before JS shutdown.
  void NotifyAboutToLoseJSContext(JSContext* aCx,
                                  const mozilla::TimeStamp& aProcessStartTime,
                                  ProfileBuffer& aBuffer);

  RunningTimes& PreviousThreadRunningTimesRef() {
    return mPreviousThreadRunningTimes;
  }

 private:
  // Group A:
  // The following fields are interesting for the entire lifetime of a
  // ProfiledThreadData object.

  // This thread's thread info. Local copy because the one in ThreadRegistration
  // may be destroyed while ProfiledThreadData stays alive.
  const mozilla::profiler::ThreadRegistrationInfo mThreadInfo;

  // Contains JSON for JIT frames from any JSContexts that were used for this
  // thread in the past.
  // Null if this thread has never lost a JSContext or if all samples from
  // previous JSContexts have been evicted from the profiler buffer.
  mozilla::UniquePtr<JITFrameInfo> mJITFrameInfoForPreviousJSContexts;

  // Group B:
  // The following fields are only used while this thread is alive and
  // registered. They become Nothing() or empty once the thread is unregistered.

  // When sampling, this holds the position in ActivePS::mBuffer of the most
  // recent sample for this thread, or Nothing() if there is no sample for this
  // thread in the buffer.
  mozilla::Maybe<uint64_t> mLastSample;

  // Only non-Nothing() if the thread currently has a JSContext.
  mozilla::Maybe<uint64_t> mBufferPositionWhenReceivedJSContext;

  // RunningTimes at the previous sample if any, or empty.
  RunningTimes mPreviousThreadRunningTimes;

  // Group C:
  // The following fields are only used once this thread has been unregistered.

  mozilla::Maybe<uint64_t> mBufferPositionWhenUnregistered;
  mozilla::TimeStamp mUnregisterTime;
};

// This class will be used when outputting the profile data for one thread.
struct ThreadStreamingContext {
  ProfiledThreadData& mProfiledThreadData;
  JSContext* mJSContext;
  SpliceableChunkedJSONWriter mSamplesDataWriter;
  SpliceableChunkedJSONWriter mMarkersDataWriter;
  SpliceableChunkedJSONWriter mShapesDataWriter;
  mozilla::NotNull<mozilla::UniquePtr<UniqueStacks>> mUniqueStacks;

  // These are updated when writing samples, and reused for "same-sample"s.
  enum PreviousStackState { eNoStackYet, eStackWasNotEmpty, eStackWasEmpty };
  PreviousStackState mPreviousStackState = eNoStackYet;
  uint32_t mPreviousStack = 0;

  ThreadStreamingContext(ProfiledThreadData& aProfiledThreadData,
                         const ProfileBuffer& aBuffer, JSContext* aCx,
                         mozilla::FailureLatch& aFailureLatch,
                         ProfilerCodeAddressService* aService,
                         mozilla::ProgressLogger aProgressLogger,
                         const nsTHashMap<SourceId, IndexIntoSourceTable>*
                             aSourceIdToIndexMap = nullptr);

  void FinalizeWriter();
};

// This class will be used when outputting the profile data for all threads.
class ProcessStreamingContext final : public mozilla::FailureLatch {
 public:
  // Pre-allocate space for `aThreadCount` threads.
  ProcessStreamingContext(size_t aThreadCount,
                          mozilla::FailureLatch& aFailureLatch,
                          const mozilla::TimeStamp& aProcessStartTime,
                          double aSinceTime);

  ~ProcessStreamingContext();

  // Add the streaming context corresponding to each profiled thread. This
  // should be called exactly the number of times specified in the constructor.
  void AddThreadStreamingContext(
      ProfiledThreadData& aProfiledThreadData, const ProfileBuffer& aBuffer,
      JSContext* aCx, ProfilerCodeAddressService* aService,
      mozilla::ProgressLogger aProgressLogger,
      const nsTHashMap<SourceId, IndexIntoSourceTable>* aSourceIdToIndexMap =
          nullptr);

  // A thread id together with the buffer position at which that thread was
  // unregistered (Nothing() if it is still registered). Kept in a compact array
  // so the per-sample thread lookup scans small entries rather than the full
  // ThreadStreamingContext objects.
  struct ThreadStreamingId {
    ProfilerThreadId mThreadId;
    mozilla::Maybe<uint64_t> mUnregisteredPosition;
  };

  // Retrieve the ThreadStreamingContext owning the sample at buffer position
  // `aEntryPosition` for `aThreadId`. Because OS thread ids are recycled, more
  // than one context can share a thread id; see SelectStreamingContextIndex.
  // Returns null if no context owns the sample.
  ThreadStreamingContext* GetThreadStreamingContext(
      const ProfilerThreadId& aThreadId, uint64_t aEntryPosition) {
    mozilla::Maybe<size_t> index =
        SelectStreamingContextIndex(mThreadIds, aThreadId, aEntryPosition);
    return index ? &mThreadStreamingContextList[*index] : nullptr;
  }

  // Choose, among the contexts sharing `aThreadId`, the one whose lifetime
  // window covers the sample at `aEntryPosition`, and return its index into
  // `aThreadIds` (Nothing() if none).
  //
  // OS thread ids are reused across short-lived threads (e.g. web workers), so
  // several contexts can share a thread id. Because a thread id is unique among
  // live threads, those contexts have disjoint, buffer-position-ordered
  // lifetime windows, and a real sample never falls in the gap between two
  // windows. So the sample belongs to the context with the smallest
  // unregistration position that is still >= aEntryPosition, or to the still-
  // registered context (no unregistration position, i.e. the latest window) if
  // no unregistered one qualifies. Exposed static for unit testing.
  static mozilla::Maybe<size_t> SelectStreamingContextIndex(
      const mozilla::Vector<ThreadStreamingId>& aThreadIds,
      const ProfilerThreadId& aThreadId, uint64_t aEntryPosition) {
    mozilla::Maybe<size_t> best;
    for (size_t i = 0; i < aThreadIds.length(); ++i) {
      if (aThreadIds[i].mThreadId != aThreadId) {
        continue;
      }
      const mozilla::Maybe<uint64_t>& end = aThreadIds[i].mUnregisteredPosition;
      if (end && *end < aEntryPosition) {
        // This thread was unregistered before the sample; it can't own it.
        continue;
      }
      if (!best) {
        best = mozilla::Some(i);
        continue;
      }
      // Prefer the narrowest qualifying window; Nothing() (still registered)
      // is treated as the widest (+infinity).
      const mozilla::Maybe<uint64_t>& bestEnd =
          aThreadIds[*best].mUnregisteredPosition;
      if (end && (!bestEnd || *end < *bestEnd)) {
        best = mozilla::Some(i);
      }
    }
    return best;
  }

  const mozilla::TimeStamp& ProcessStartTime() const {
    return mProcessStartTime;
  }

  double GetSinceTime() const { return mSinceTime; }

  ThreadStreamingContext* begin() {
    return mThreadStreamingContextList.begin();
  };
  ThreadStreamingContext* end() { return mThreadStreamingContextList.end(); };

  FAILURELATCH_IMPL_PROXY(mFailureLatch)

 private:
  // Thread ids and their unregistration positions; it's much faster to do a
  // linear search here than in a vector of bigger items like
  // mThreadStreamingContextList.
  mozilla::Vector<ThreadStreamingId> mThreadIds;
  // Contexts corresponding to the thread id at the same indexes.
  mozilla::Vector<ThreadStreamingContext> mThreadStreamingContextList;

  mozilla::FailureLatch& mFailureLatch;

  const mozilla::TimeStamp mProcessStartTime;

  const double mSinceTime;
};

// Stream all samples and markers from aBuffer with the given aThreadId (or 0
// for everything, which is assumed to be a single backtrace sample.)
// Returns the thread id of the output sample(s), or 0 if none was present.
ProfilerThreadId StreamSamplesAndMarkers(
    const char* aName, ProfilerThreadId aThreadId, const ProfileBuffer& aBuffer,
    SpliceableJSONWriter& aWriter, const nsACString& aProcessName,
    const nsACString& aETLDplus1, const mozilla::TimeStamp& aProcessStartTime,
    const mozilla::TimeStamp& aRegisterTime,
    const mozilla::TimeStamp& aUnregisterTime, double aSinceTime,
    UniqueStacks& aUniqueStacks, mozilla::ProgressLogger aProgressLogger);
void StreamSamplesAndMarkers(const char* aName,
                             ThreadStreamingContext& aThreadData,
                             SpliceableJSONWriter& aWriter,
                             const nsACString& aProcessName,
                             const nsACString& aETLDplus1,
                             const mozilla::TimeStamp& aProcessStartTime,
                             const mozilla::TimeStamp& aRegisterTime,
                             const mozilla::TimeStamp& aUnregisterTime,
                             mozilla::ProgressLogger aProgressLogger);

#endif  // ProfiledThreadData_h
