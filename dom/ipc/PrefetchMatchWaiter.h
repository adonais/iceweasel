/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PrefetchMatchWaiter_h
#define mozilla_dom_PrefetchMatchWaiter_h

#include "mozilla/Atomics.h"
#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/dom/PrefetchRecordParent.h"
#include "nsCOMPtr.h"
#include "nsITimer.h"
#include "nsIURI.h"

namespace mozilla::dom {

class PrefetchRecordParent;
class WindowGlobalParent;

// Promise resolved with the matching PrefetchRecordParent* on success,
// or nullptr if the timeout expires before a match is found.
using PrefetchMatchPromise =
    MozPromise<RefPtr<PrefetchRecordParent>, nsresult, /* IsExclusive */ true>;

// Background: when a navigation's URL matches a prefetch that is still in
// flight, the spec has the navigation wait for that prefetch to finish
// rather than starting a second, redundant fetch for the same resource. A
// prefetch can still be ongoing when its navigation arrives because
// speculation rules start prefetches ahead of time based on a guess of user
// intent, and that guess can resolve into a real navigation before the
// network response comes back.
//
// PrefetchMatchWaiter is the async half of that algorithm: it is registered
// on WindowGlobalParent when a navigation arrives and finds no completed
// match yet, but at least one ongoing prefetch record could still become
// one. It resolves its promise with the matching record once that record
// completes, with nullptr once no ongoing record could still match (so the
// navigation can fall back to a normal fetch), or with nullptr when the
// dom.speculation_rules.wait_timeout_ms timeout fires first.
//
// Thread safety: must be used on the main thread only.
//
// Spec:
// https://wicg.github.io/nav-speculation/prefetch.html#wait-for-a-matching-prefetch-record
class PrefetchMatchWaiter final {
 public:
  NS_INLINE_DECL_REFCOUNTING(PrefetchMatchWaiter)

  // Starts the timeout timer, which needs a strong self-reference for its
  // callback; done here, after construction, rather than in the constructor,
  // since `this` has no owning RefPtr yet while the constructor is running.
  static already_AddRefed<PrefetchMatchWaiter> Create(WindowGlobalParent* aWGP,
                                                      nsIURI* aURI,
                                                      TimeDuration aTimeout);

  RefPtr<PrefetchMatchPromise> Promise() {
    return mPromiseHolder.Ensure(__func__);
  }

  // Called by WindowGlobalParent::NotifyPrefetchStateChanged when any record's
  // state changes. Re-runs FindMatchingPrefetchRecord and resolves if found.
  void OnRecordStateChanged(PrefetchRecordParent* aRec);

 private:
  PrefetchMatchWaiter(WindowGlobalParent* aWGP, nsIURI* aURI,
                      TimeDuration aTimeout);
  ~PrefetchMatchWaiter() = default;

  // Resolves exactly once (atomic exchange guard). Cancels timer, resolves
  // promise with aMatch (nullptr on timeout), and removes self from WGP.
  void Resolve(PrefetchRecordParent* aMatch);

  RefPtr<WindowGlobalParent> mWGP;
  nsCOMPtr<nsIURI> mURI;
  nsCOMPtr<nsITimer> mTimer;
  MozPromiseHolder<PrefetchMatchPromise> mPromiseHolder;
  // Ensures Resolve is called at most once even if timer and state-change
  // fire concurrently.
  Atomic<bool> mResolved{false};
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PrefetchMatchWaiter_h
