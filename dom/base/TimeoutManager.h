/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_TimeoutManager_h__
#define mozilla_dom_TimeoutManager_h__

#include "mozilla/dom/Timeout.h"
#include "nsTArray.h"
#include "nsISerialEventTarget.h"
#include "mozilla/dom/TimeoutBudgetManager.h"

class nsIEventTarget;
class nsITimer;
class nsIGlobalObject;

namespace mozilla {

namespace dom {

class TimeoutExecutor;
class TimeoutHandler;

// This class manages the timeouts in a Window's setTimeout/setInterval pool.
class TimeoutManager final {
 private:
  struct Timeouts;

 public:
  TimeoutManager(nsIGlobalObject& aHandle, uint32_t aMaxIdleDeferMS,
                 nsISerialEventTarget* aEventTarget);
  ~TimeoutManager();
  TimeoutManager(const TimeoutManager& rhs) = delete;
  void operator=(const TimeoutManager& rhs) = delete;

  bool IsRunningTimeout() const;

  uint32_t GetNestingLevelForWorker() {
    MOZ_ASSERT(!NS_IsMainThread());
    return mNestingLevel;
  }
  uint32_t GetNestingLevelForWindow() {
    MOZ_ASSERT(NS_IsMainThread());
    return sNestingLevel;
  }

  void SetNestingLevelForWorker(uint32_t aLevel) {
    MOZ_ASSERT(!NS_IsMainThread());
    mNestingLevel = aLevel;
  }

  void SetNestingLevelForWindow(uint32_t aLevel) {
    MOZ_ASSERT(NS_IsMainThread());
    sNestingLevel = aLevel;
  }

  bool HasTimeouts() const {
    return !mTimeouts.IsEmpty() || !mIdleTimeouts.IsEmpty();
  }

  nsresult SetTimeout(TimeoutHandler* aHandler, int32_t interval,
                      bool aIsInterval, mozilla::dom::Timeout::Reason aReason,
                      int32_t* aReturn);
  void ClearTimeout(int32_t aTimerId, mozilla::dom::Timeout::Reason aReason);
  bool ClearTimeoutInternal(int32_t aTimerId,
                            mozilla::dom::Timeout::Reason aReason,
                            bool aIsIdle);

  // The timeout implementation functions.
  MOZ_CAN_RUN_SCRIPT
  void RunTimeout(const TimeStamp& aNow, const TimeStamp& aTargetDeadline,
                  bool aProcessIdle);

  void ClearAllTimeouts();
  int32_t GetTimeoutId(mozilla::dom::Timeout::Reason aReason);

  TimeDuration CalculateDelay(Timeout* aTimeout) const;

  // aTimeout is the timeout that we're about to start running.  This function
  // returns the current timeout.
  mozilla::dom::Timeout* BeginRunningTimeout(mozilla::dom::Timeout* aTimeout);
  // aTimeout is the last running timeout.
  void EndRunningTimeout(mozilla::dom::Timeout* aTimeout);

  void UnmarkGrayTimers();

  // These four methods are intended to be called from the corresponding methods
  // on nsGlobalWindow.
  void Suspend();
  void Resume();
  void Freeze();
  void Thaw();

  // This should be called by nsGlobalWindow when the window might have moved
  // to the background or foreground.
  void UpdateBackgroundState();

  // The document finished loading
  void OnDocumentLoaded();
  void StartThrottlingTimeouts();

  // Run some code for each Timeout in our list.  Note that this function
  // doesn't guarantee that Timeouts are iterated in any particular order.
  template <class Callable>
  void ForEachUnorderedTimeout(Callable c) {
    mIdleTimeouts.ForEach(c);
    mTimeouts.ForEach(c);
  }

  void BeginSyncOperation();
  void EndSyncOperation();

  nsIEventTarget* EventTarget();

  bool BudgetThrottlingEnabled(bool aIsBackground) const;

  static const uint32_t InvalidFiringId;

  void SetLoading(bool value);

 private:
  void MaybeStartThrottleTimeout();

  // get nsGlobalWindowInner
  // if the method returns nullptr, then we have a worker,
  // which should be handled differently according to TimeoutManager logic
  nsGlobalWindowInner* GetInnerWindow() const {
    return nsGlobalWindowInner::Cast(mGlobalObject.GetAsInnerWindow());
  }

  // Return true if |aTimeout| needs to be reinserted into the timeout list.
  bool RescheduleTimeout(mozilla::dom::Timeout* aTimeout,
                         const TimeStamp& aLastCallbackTime,
                         const TimeStamp& aCurrentNow);

  void MoveIdleToActive();

  bool IsBackground() const;

  bool IsActive() const;

  uint32_t CreateFiringId();

  void DestroyFiringId(uint32_t aFiringId);

  bool IsValidFiringId(uint32_t aFiringId) const;

  bool IsInvalidFiringId(uint32_t aFiringId) const;

  TimeDuration MinSchedulingDelay() const;

  nsresult MaybeSchedule(const TimeStamp& aWhen,
                         const TimeStamp& aNow = TimeStamp::Now());

  void RecordExecution(Timeout* aRunningTimeout, Timeout* aTimeout);

  void UpdateBudget(const TimeStamp& aNow,
                    const TimeDuration& aDuration = TimeDuration());

 private:
  struct Timeouts {
    explicit Timeouts(const TimeoutManager& aManager)
        : mManager(aManager), mTimeouts(new Timeout::TimeoutSet()) {}

    // Insert aTimeout into the list, before all timeouts that would
    // fire after it, but no earlier than the last Timeout with a
    // valid FiringId.
    enum class SortBy { TimeRemaining, TimeWhen };
    void Insert(mozilla::dom::Timeout* aTimeout, SortBy aSortBy);

    const Timeout* GetFirst() const { return mTimeoutList.getFirst(); }
    Timeout* GetFirst() { return mTimeoutList.getFirst(); }
    const Timeout* GetLast() const { return mTimeoutList.getLast(); }
    Timeout* GetLast() { return mTimeoutList.getLast(); }
    bool IsEmpty() const { return mTimeoutList.isEmpty(); }
    void InsertFront(Timeout* aTimeout) {
      aTimeout->SetTimeoutContainer(mTimeouts);
      mTimeoutList.insertFront(aTimeout);
    }
    void InsertBack(Timeout* aTimeout) {
      aTimeout->SetTimeoutContainer(mTimeouts);
      mTimeoutList.insertBack(aTimeout);
    }
    void Clear() {
      mTimeouts->Clear();
      mTimeoutList.clear();
    }

    template <class Callable>
    void ForEach(Callable c) {
      for (Timeout* timeout = GetFirst(); timeout;
           timeout = timeout->getNext()) {
        c(timeout);
      }
    }

    // Returns true when a callback aborts iteration.
    template <class Callable>
    bool ForEachAbortable(Callable c) {
      for (Timeout* timeout = GetFirst(); timeout;
           timeout = timeout->getNext()) {
        if (c(timeout)) {
          return true;
        }
      }
      return false;
    }

    Timeout* GetTimeout(int32_t aTimeoutId, Timeout::Reason aReason) {
      Timeout::TimeoutIdAndReason key = {aTimeoutId, aReason};
      return mTimeouts->Get(key);
    }

   private:
    // The TimeoutManager that owns this Timeouts structure.  This is
    // mainly used to call state inspecting methods like IsValidFiringId().
    const TimeoutManager& mManager;

    using TimeoutList = mozilla::LinkedList<RefPtr<Timeout>>;

    // mTimeoutList is generally sorted by mWhen, but new values are always
    // inserted after any Timeouts with a valid FiringId.
    TimeoutList mTimeoutList;

    // mTimeouts is a set of all the timeouts in the mTimeoutList.
    // It let's one to have O(1) check whether a timeout id/reason is in the
    // list.
    RefPtr<Timeout::TimeoutSet> mTimeouts;
  };

  // Each nsIGlobalObject object has a TimeoutManager member.  This
  // reference points to that holder object.
  nsIGlobalObject& mGlobalObject;
  // The executor is specific to the nsGlobalWindow/TimeoutManager, but it
  // can live past the destruction of the window if its scheduled.  Therefore
  // it must be a separate ref-counted object.
  RefPtr<TimeoutExecutor> mExecutor;
  // For timeouts run off the idle queue
  RefPtr<TimeoutExecutor> mIdleExecutor;
  // The list of timeouts coming from non-tracking scripts.
  Timeouts mTimeouts;
  int32_t mTimeoutIdCounter;
  uint32_t mNextFiringId;
#ifdef DEBUG
  int64_t mFiringIndex;
  int64_t mLastFiringIndex;
#endif
  AutoTArray<uint32_t, 2> mFiringIdStack;
  mozilla::dom::Timeout* mRunningTimeout;

  // Timeouts that would have fired but are being deferred until MainThread
  // is idle (because we're loading)
  Timeouts mIdleTimeouts;

  // The current idle request callback timeout handle
  int32_t mIdleCallbackTimeoutCounter;

  nsCOMPtr<nsITimer> mThrottleTimeoutsTimer;
  mozilla::TimeStamp mLastBudgetUpdate;
  mozilla::TimeDuration mExecutionBudget;

  bool mThrottleTimeouts;
  bool mThrottleTrackingTimeouts;
  bool mBudgetThrottleTimeouts;

  bool mIsLoading;
  nsCOMPtr<nsISerialEventTarget> mEventTarget;

  const bool mIsWindow;

  uint32_t mNestingLevel{0};

  static uint32_t sNestingLevel;

  TimeoutBudgetManager mBudgetManager;
  static TimeoutBudgetManager sBudgetManager;
};

}  // namespace dom
}  // namespace mozilla

#endif
