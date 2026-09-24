/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_idlerequest_h
#define mozilla_dom_idlerequest_h

#include "mozilla/LinkedList.h"
#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsDOMNavigationTiming.h"
#include "nsICancelableRunnable.h"
#include "nsString.h"
#include "nsTHashMap.h"

class nsPIDOMWindowInner;

namespace mozilla::dom {

class IdleRequest;
class IdleRequestCallback;

class IdleRequestMap : public nsTHashMap<uint32_t, IdleRequest*> {
 public:
  NS_INLINE_DECL_REFCOUNTING(IdleRequestMap);

 private:
  ~IdleRequestMap() = default;
};

class IdleRequest final : protected LinkedListElement<RefPtr<IdleRequest>> {
 public:
  IdleRequest(IdleRequestCallback* aCallback, uint32_t aHandle);

  MOZ_CAN_RUN_SCRIPT
  void IdleRun(nsPIDOMWindowInner* aWindow, DOMHighResTimeStamp aDeadline,
               bool aDidTimeout);

  void SetTimeoutHandle(int32_t aHandle);
  bool HasTimeout() const { return mTimeoutHandle.isSome(); }
  int32_t GetTimeoutHandle() const;

  uint32_t Handle() const { return mHandle; }

  void SetContainer(IdleRequestMap* aContainer) {
    if (mContainer) {
      mContainer->Remove(mHandle);
    }
    mContainer = aContainer;
    if (mContainer) {
      mContainer->InsertOrUpdate(mHandle, this);
    }
  }

  // All removals must go through here so the handle is deregistered.
  void RemoveFromList() {
    MOZ_ASSERT(mContainer);
    SetContainer(nullptr);
    LinkedListElement<RefPtr<IdleRequest>>::remove();
  }

  NS_DECL_CYCLE_COLLECTION_NATIVE_CLASS(IdleRequest)
  NS_INLINE_DECL_CYCLE_COLLECTING_NATIVE_REFCOUNTING(IdleRequest)
 private:
  ~IdleRequest();

  RefPtr<IdleRequestCallback> mCallback;
  const uint32_t mHandle;
  mozilla::Maybe<int32_t> mTimeoutHandle;
  RefPtr<IdleRequestMap> mContainer;

  friend class LinkedList<RefPtr<IdleRequest>>;
  friend class LinkedListElement<RefPtr<IdleRequest>>;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_idlerequest_h
