/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TimerThread_h_
#define TimerThread_h_

#include "TimerThreadMonitor.h"
#include "mozilla/ProfilerUtils.h"
#include "nsIObserver.h"
#include "nsIRunnable.h"
#include "nsIThread.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"
#include "nsTimerImpl.h"

// Enable this to compute lots of interesting statistics and print them out when
// PrintStatistics() is called.
#define TIMER_THREAD_STATISTICS 0

class TimerThread final : public mozilla::Runnable, public nsIObserver {
 public:
  typedef mozilla::MutexAutoLock MutexAutoLock;
  typedef mozilla::TimeStamp TimeStamp;
  typedef mozilla::TimeDuration TimeDuration;

  TimerThread();

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIRUNNABLE
  NS_DECL_NSIOBSERVER

  nsresult Shutdown();

  nsresult AddTimer(nsTimerImpl* aTimer, const MutexAutoLock& aProofOfLock)
      MOZ_REQUIRES(aTimer->mMutex);
  nsresult RemoveTimer(nsTimerImpl* aTimer, const MutexAutoLock& aProofOfLock)
      MOZ_REQUIRES(aTimer->mMutex);
  // Considering only the first 'aSearchBound' timers (in firing order), returns
  // the timeout of the first non-low-priority timer, on the current thread,
  // that will fire before 'aDefault'. If no such timer exists, 'aDefault' is
  // returned.
  TimeStamp FindNextFireTimeForCurrentThread(TimeStamp aDefault,
                                             uint32_t aSearchBound);

  void DoBeforeSleep();
  void DoAfterSleep();

  bool IsOnTimerThread() const { return mThread->IsOnCurrentThread(); }

  uint32_t AllowedEarlyFiringMicroseconds();
  nsresult GetTimers(nsTArray<RefPtr<nsITimer>>& aRetVal);

 private:
  ~TimerThread();

  bool mInitialized;

  // These internal helper methods must be called while mMonitor is held.
  void AddTimerInternal(nsTimerImpl& aTimer) MOZ_REQUIRES(mMonitor);
  bool RemoveTimerInternal(nsTimerImpl& aTimer)
      MOZ_REQUIRES(mMonitor, aTimer.mMutex);
  void RemoveLeadingCanceledTimersInternal() MOZ_REQUIRES(mMonitor);
  nsresult Init() MOZ_REQUIRES(mMonitor);
  void AssertTimersSortedAndUnique() MOZ_REQUIRES(mMonitor);

  nsCOMPtr<nsIThread> mThread;
  // Lock ordering requirements:
  // (optional) ThreadWrapper::sMutex ->
  // (optional) nsTimerImpl::mMutex   ->
  // TimerThread::mMonitor
  mozilla::TimerThreadMonitor mMonitor;

  bool mShutdown MOZ_GUARDED_BY(mMonitor);
  bool mWaiting MOZ_GUARDED_BY(mMonitor);
  bool mNotified MOZ_GUARDED_BY(mMonitor);
  bool mSleeping MOZ_GUARDED_BY(mMonitor);

  struct EntryKey {
    explicit EntryKey(nsTimerImpl& aTimerImpl)
        : mTimeout(aTimerImpl.mTimeout), mTimerSeq(aTimerImpl.mTimerSeq) {}

    // The comparison operators must ensure to detect equality only for
    // equal mTimerImpl except for canceled timers.
    // This is achieved through the sequence number.
    // Currently we maintain a FIFO order for timers with equal timeout.
    // Note that it might make sense to flip the sequence order to favor
    // timeouts with smaller delay as they are most likely more sensitive
    // to jitter. But we strictly test for FIFO order in our gtests.

    bool operator==(const EntryKey& aRhs) const {
      return (mTimeout == aRhs.mTimeout && mTimerSeq == aRhs.mTimerSeq);
    }

    bool operator<(const EntryKey& aRhs) const {
      if (mTimeout == aRhs.mTimeout) {
        return mTimerSeq < aRhs.mTimerSeq;
      }
      return mTimeout < aRhs.mTimeout;
    }

    TimeStamp mTimeout;
    uint64_t mTimerSeq;
  };

  struct Entry final : EntryKey {
    explicit Entry(nsTimerImpl& aTimerImpl) MOZ_REQUIRES(aTimerImpl.mMutex)
        : EntryKey(aTimerImpl),
          mDelay(aTimerImpl.mDelay),
          mFiringDelay(aTimerImpl.AcceptableFiringDelay()),
          mTimerImpl(&aTimerImpl) {}

    // No copies to not fiddle with mTimerImpl's ref-count.
    Entry(const Entry&) = delete;
    Entry& operator=(const Entry&) = delete;
    Entry(Entry&&) = default;
    Entry& operator=(Entry&&) = default;

#ifdef DEBUG
    // While the timer is stored in the thread's list, the timeout is
    // immutable, so it should be OK to read without holding the mutex.
    // We only allow this in debug builds.
    bool IsTimerInThreadAndUnchanged() MOZ_NO_THREAD_SAFETY_ANALYSIS {
      return (mTimerImpl && mTimerImpl->IsInTimerThread() &&
              mTimerImpl->mTimeout == mTimeout);
    }
#endif

    TimeDuration mDelay;
    TimeDuration mFiringDelay;
    RefPtr<nsTimerImpl> mTimerImpl;
  };

  void PostTimerEvent(Entry& aPostMe) MOZ_REQUIRES(mMonitor);

  // WakeupTime encompasses both a point in time at which we should wake up and
  // tolerance for how much that wake-up can be delayed.
  struct WakeupTime {
    const TimeStamp mWakeupTime;
    const TimeDuration mDelayTolerance;
  };

  // Computes and returns when we should next try to wake up in order to handle
  // the triggering of the timers in mTimers.
  // If mTimers is empty, returns a null TimeStamp. If mTimers is not empty,
  // returns the timeout of the last timer that can be bundled with the first
  // timer in mTimers along with a tolerance indicating the most that we can be
  // delayed and not violate the tolerances of any of the timers in the bundle.
  WakeupTime ComputeWakeupTimeFromTimers() const MOZ_REQUIRES(mMonitor);

  // Fires and removes all timers in mTimers that are "due" to be fired,
  // according to the current time and the passed-in early firing tolerance.
  // Return value is the number of timers that were fired by the operation.
  uint64_t FireDueTimers(TimeDuration aAllowedEarlyFiring)
      MOZ_REQUIRES(mMonitor);

  // Suspends thread execution using mMonitor.Wait(waitFor). Also sets and
  // clears a few flags before and after.
  void Wait(TimeDuration aWaitFor, TimeDuration aTolerance)
      MOZ_REQUIRES(mMonitor);

  // mTimers is sorted by timeout, followed by a unique sequence number.
  // Some entries are for cancelled entries, but remain in sorted order based
  // on the timeout and sequence number they were originally created with.
  nsTArray<Entry> mTimers MOZ_GUARDED_BY(mMonitor);

  // Set only at the start of the thread's Run():
  uint32_t mAllowedEarlyFiringMicroseconds MOZ_GUARDED_BY(mMonitor);

  ProfilerThreadId mProfilerThreadId MOZ_GUARDED_BY(mMonitor);

  // End of the wakeup window handed to the monitor the last time that we
  // slept. Is "null" if we have never slept or if our last sleep was "forever".
  TimeStamp mLatestIntendedWakeupTime;

#if TIMER_THREAD_STATISTICS
  // Start of that window, with the same "null" cases.
  TimeStamp mIntendedWakeupTime;

  static constexpr size_t sTimersFiredPerWakeupBucketCount = 16;
  static inline constexpr std::array<size_t, sTimersFiredPerWakeupBucketCount>
      sTimersFiredPerWakeupThresholds = {
          0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 20, 30, 40, 50, 70, (size_t)(-1)};

  mutable AutoTArray<size_t, sTimersFiredPerWakeupBucketCount>
      mTimersFiredPerWakeup MOZ_GUARDED_BY(mMonitor) = {0, 0, 0, 0, 0, 0, 0, 0,
                                                        0, 0, 0, 0, 0, 0, 0, 0};
  mutable AutoTArray<size_t, sTimersFiredPerWakeupBucketCount>
      mTimersFiredPerUnnotifiedWakeup MOZ_GUARDED_BY(mMonitor) = {
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
  mutable AutoTArray<size_t, sTimersFiredPerWakeupBucketCount>
      mTimersFiredPerNotifiedWakeup MOZ_GUARDED_BY(mMonitor) = {
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

  mutable size_t mTotalTimersAdded MOZ_GUARDED_BY(mMonitor) = 0;
  mutable size_t mTotalTimersRemoved MOZ_GUARDED_BY(mMonitor) = 0;
  mutable size_t mTotalTimersFiredNotified MOZ_GUARDED_BY(mMonitor) = 0;
  mutable size_t mTotalTimersFiredUnnotified MOZ_GUARDED_BY(mMonitor) = 0;

  mutable size_t mTotalWakeupCount MOZ_GUARDED_BY(mMonitor) = 0;
  mutable size_t mTotalUnnotifiedWakeupCount MOZ_GUARDED_BY(mMonitor) = 0;
  mutable size_t mTotalNotifiedWakeupCount MOZ_GUARDED_BY(mMonitor) = 0;

  mutable double mTotalActualTimerFiringDelayNotified MOZ_GUARDED_BY(mMonitor) =
      0.0;
  mutable double mTotalActualTimerFiringDelayUnnotified
      MOZ_GUARDED_BY(mMonitor) = 0.0;

  mutable TimeStamp mFirstTimerAdded MOZ_GUARDED_BY(mMonitor);

  mutable size_t mEarlyWakeups MOZ_GUARDED_BY(mMonitor) = 0;
  mutable double mTotalEarlyWakeupTime MOZ_GUARDED_BY(mMonitor) = 0.0;

  void CollectTimersFiredStatistics(uint64_t timersFiredThisWakeup);

  void CollectWakeupStatistics();

  void PrintStatistics() const;
#endif
};
#endif /* TimerThread_h_ */
