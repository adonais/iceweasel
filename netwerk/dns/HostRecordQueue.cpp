/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HostRecordQueue.h"

#include "mozilla/glean/NetwerkDnsMetrics.h"
#include "nsQueryObject.h"

namespace mozilla {
namespace net {

void HostRecordQueue::InsertRecord(nsHostRecord* aRec,
                                   nsIDNSService::DNSFlags aFlags) {
  if (aRec->isInList()) {
    MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
    MOZ_DIAGNOSTIC_ASSERT(!aRec->mInEvictionQueue, "Already in eviction queue");
    MOZ_DIAGNOSTIC_ASSERT(!mHighQ.contains(aRec), "Already in high queue");
    MOZ_DIAGNOSTIC_ASSERT(!mMediumQ.contains(aRec), "Already in med queue");
    MOZ_DIAGNOSTIC_ASSERT(!mLowQ.contains(aRec), "Already in low queue");
    MOZ_DIAGNOSTIC_CRASH("Already on some other queue?");
  }

  switch (AddrHostRecord::GetPriority(aFlags)) {
    case AddrHostRecord::DNS_PRIORITY_HIGH:
      mHighQ.insertBack(aRec);
      break;

    case AddrHostRecord::DNS_PRIORITY_MEDIUM:
      mMediumQ.insertBack(aRec);
      break;

    case AddrHostRecord::DNS_PRIORITY_LOW:
      mLowQ.insertBack(aRec);
      break;
  }
  mPendingCount++;
}

void HostRecordQueue::PutInEvictionQ(nsHostRecord* aRec) {
  MOZ_ASSERT(!aRec->isInList());
  MOZ_ASSERT(!aRec->mInEvictionQueue);
  mEvictionQ.insertBack(aRec);
  aRec->mInEvictionQueue = true;
}

void HostRecordQueue::RemoveFromEvictionQ(nsHostRecord* aRec) {
  MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
  MOZ_ASSERT(aRec->mInEvictionQueue);
  aRec->remove();
  aRec->mInEvictionQueue = false;
}

void HostRecordQueue::AddToEvictionQ(
    nsHostRecord* aRec, uint32_t aMaxCacheEntries,
    nsRefPtrHashtable<nsGenericHashKey<nsHostKey>, nsHostRecord>& aDB) {
  if (aRec->isInList()) {
    MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
    bool inEvictionQ = aRec->mInEvictionQueue;
    MOZ_DIAGNOSTIC_ASSERT(!inEvictionQ, "Already in eviction queue");
    bool inHighQ = mHighQ.contains(aRec);
    MOZ_DIAGNOSTIC_ASSERT(!inHighQ, "Already in high queue");
    bool inMediumQ = mMediumQ.contains(aRec);
    MOZ_DIAGNOSTIC_ASSERT(!inMediumQ, "Already in med queue");
    bool inLowQ = mLowQ.contains(aRec);
    MOZ_DIAGNOSTIC_ASSERT(!inLowQ, "Already in low queue");
    MOZ_DIAGNOSTIC_CRASH("Already on some other queue?");

    // Bug 1678117 - it's not clear why this can happen, but let's fix it
    // for release users.
    if (inEvictionQ) {
      RemoveFromEvictionQ(aRec);
      MOZ_DIAGNOSTIC_ASSERT(mEvictionQSize > 0);
      mEvictionQSize--;
    } else {
      aRec->remove();
      if (inHighQ || inMediumQ || inLowQ) {
        MOZ_DIAGNOSTIC_ASSERT(mPendingCount > 0);
        mPendingCount--;
      }
    }
  }
  PutInEvictionQ(aRec);
  if (mEvictionQSize < aMaxCacheEntries) {
    mEvictionQSize++;
  } else {
    // remove first element on mEvictionQ
    RefPtr<nsHostRecord> head = mEvictionQ.getFirst();
    RemoveFromEvictionQ(head);
    aDB.Remove(*static_cast<nsHostKey*>(head.get()));

    bool stillValid =
        head->CheckExpiration(TimeStamp::Now()) != nsHostRecord::EXP_EXPIRED;
    if (!head->negative) {
      // record the age of the entry upon eviction. Only positive records have a
      // valid mValidStart (set in PrepareRecordExpiration); negative records
      // may leave it null, so computing the age there would assert.
      TimeDuration age = TimeStamp::NowLoRes() - head->mValidStart;
      if (head->IsAddrRecord()) {
        glean::dns::cleanup_age.AccumulateRawDuration(age);
        if (stillValid) {
          glean::dns::premature_eviction.AccumulateRawDuration(age);
        }
      } else {
        glean::dns::by_type_cleanup_age.AccumulateRawDuration(age);
        if (stillValid) {
          glean::dns::by_type_premature_eviction.AccumulateRawDuration(age);
        }
      }
    } else {
      // Negative record (A/AAAA or by-type, e.g. HTTPS) evicted because the
      // cache reached its size limit. Split by family and by whether it was
      // still within its (short) negative lifetime, to distinguish size-driven
      // eviction from TTL expiry.
      glean::dns::negative_eviction
          .Get(RecordFamilyLabel(head),
               stillValid ? "premature"_ns : "expired"_ns)
          .Add(1);
    }
  }
}

void HostRecordQueue::MoveToEvictionQueueTail(nsHostRecord* aRec) {
  MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
  if (!aRec->mInEvictionQueue) {
    // Note: this function can be called when the record isn't in the
    // mEvictionQ. For example, if we immediately start a TTL lookup (see
    // nsHostResolver::CompleteLookupLocked), the record may not be in
    // mEvictionQ.
    return;
  }

  // Re-link to the tail (most-recently-used end).
  RemoveFromEvictionQ(aRec);
  PutInEvictionQ(aRec);
}

void HostRecordQueue::MaybeRenewHostRecord(nsHostRecord* aRec) {
  if (!aRec->isInList()) {
    return;
  }

  MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
  bool inEvictionQ = aRec->mInEvictionQueue;
  MOZ_DIAGNOSTIC_ASSERT(inEvictionQ, "Should be in eviction queue");
  bool inHighQ = mHighQ.contains(aRec);
  MOZ_DIAGNOSTIC_ASSERT(!inHighQ, "Already in high queue");
  bool inMediumQ = mMediumQ.contains(aRec);
  MOZ_DIAGNOSTIC_ASSERT(!inMediumQ, "Already in med queue");
  bool inLowQ = mLowQ.contains(aRec);
  MOZ_DIAGNOSTIC_ASSERT(!inLowQ, "Already in low queue");

  // we're already on the eviction queue. This is a renewal
  if (inEvictionQ) {
    RemoveFromEvictionQ(aRec);
    MOZ_DIAGNOSTIC_ASSERT(mEvictionQSize > 0);
    mEvictionQSize--;
  } else {
    aRec->remove();
    if (inHighQ || inMediumQ || inLowQ) {
      MOZ_DIAGNOSTIC_ASSERT(mPendingCount > 0);
      mPendingCount--;
    }
  }
}

void HostRecordQueue::FlushEvictionQ(
    nsRefPtrHashtable<nsGenericHashKey<nsHostKey>, nsHostRecord>& aDB) {
  // Clear the evictionQ and remove all its corresponding entries from
  // the cache first
  for (const RefPtr<nsHostRecord>& rec : mEvictionQ) {
    rec->Cancel();
    rec->mInEvictionQueue = false;
    aDB.Remove(*static_cast<nsHostKey*>(rec));
  }
  mEvictionQ.clear();
  mEvictionQSize = 0;
}

void HostRecordQueue::MaybeRemoveFromQ(nsHostRecord* aRec) {
  if (!aRec->isInList()) {
    return;
  }

  MOZ_ASSERT(aRec->mInEvictionQueue == mEvictionQ.contains(aRec));
  if (mHighQ.contains(aRec) || mMediumQ.contains(aRec) ||
      mLowQ.contains(aRec)) {
    mPendingCount--;
    aRec->remove();
  } else if (aRec->mInEvictionQueue) {
    RemoveFromEvictionQ(aRec);
    mEvictionQSize--;
  } else {
    MOZ_ASSERT(false, "record is in other queue");
    aRec->remove();
  }
}

void HostRecordQueue::MoveToAnotherPendingQ(nsHostRecord* aRec,
                                            nsIDNSService::DNSFlags aFlags) {
  if (!(mHighQ.contains(aRec) || mMediumQ.contains(aRec) ||
        mLowQ.contains(aRec))) {
    MOZ_ASSERT(false, "record is not in the pending queue");
    return;
  }

  aRec->remove();
  // We just removed from pending queue. Insert record will
  // increment this value again.
  mPendingCount--;

  InsertRecord(aRec, aFlags);
}

already_AddRefed<nsHostRecord> HostRecordQueue::Dequeue(bool aHighQOnly) {
  RefPtr<nsHostRecord> rec;
  if (!mHighQ.isEmpty()) {
    rec = mHighQ.popFirst();
  } else if (!mMediumQ.isEmpty() && !aHighQOnly) {
    rec = mMediumQ.popFirst();
  } else if (!mLowQ.isEmpty() && !aHighQOnly) {
    rec = mLowQ.popFirst();
  }

  if (rec) {
    mPendingCount--;
  }

  return rec.forget();
}

void HostRecordQueue::ClearAll(
    const std::function<void(nsHostRecord*)>& aCallback) {
  mPendingCount = 0;

  auto clearPendingQ = [&](LinkedList<RefPtr<nsHostRecord>>& aPendingQ) {
    if (aPendingQ.isEmpty()) {
      return;
    }

    // loop through pending queue, erroring out pending lookups.
    for (const RefPtr<nsHostRecord>& rec : aPendingQ) {
      rec->Cancel();
      aCallback(rec);
    }
    aPendingQ.clear();
  };

  clearPendingQ(mHighQ);
  clearPendingQ(mMediumQ);
  clearPendingQ(mLowQ);

  for (const RefPtr<nsHostRecord>& rec : mEvictionQ) {
    rec->Cancel();
    rec->mInEvictionQueue = false;
  }
  mEvictionQ.clear();
  mEvictionQSize = 0;
}

}  // namespace net
}  // namespace mozilla
