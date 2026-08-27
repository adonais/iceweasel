/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/PrefetchMatchWaiter.h"

#include "mozilla/dom/PrefetchLog.h"
#include "mozilla/dom/PrefetchRecordParent.h"
#include "mozilla/dom/WindowGlobalParent.h"

namespace mozilla::dom {

PrefetchMatchWaiter::PrefetchMatchWaiter(WindowGlobalParent* aWGP, nsIURI* aURI,
                                         TimeDuration aTimeout)
    : mWGP(aWGP), mURI(aURI) {
  LOG_SPECRULES((
      "PrefetchMatchWaiter ctor: this=%p url=%s timeout=%.0fms", this,
      [&] {
        nsAutoCString s;
        if (aURI) {
          aURI->GetSpec(s);
        }
        return s;
      }()
          .get(),
      aTimeout.ToMilliseconds()));
}

already_AddRefed<PrefetchMatchWaiter> PrefetchMatchWaiter::Create(
    WindowGlobalParent* aWGP, nsIURI* aURI, TimeDuration aTimeout) {
  RefPtr<PrefetchMatchWaiter> self =
      new PrefetchMatchWaiter(aWGP, aURI, aTimeout);
  NS_NewTimerWithCallback(
      getter_AddRefs(self->mTimer),
      [self](nsITimer*) {
        LOG_SPECRULES(("PrefetchMatchWaiter::OnTimeout: this=%p", self.get()));
        self->Resolve(nullptr);
      },
      static_cast<uint32_t>(aTimeout.ToMilliseconds()), nsITimer::TYPE_ONE_SHOT,
      "PrefetchMatchWaiter"_ns);
  return self.forget();
}

void PrefetchMatchWaiter::OnRecordStateChanged(PrefetchRecordParent* aRec) {
  // Implements the "wait until the state of any element ... changes" step
  // of "wait for a matching prefetch record": re-run the loop body once for
  // the record whose state just changed.
  // Spec:
  // https://wicg.github.io/nav-speculation/prefetch.html#wait-for-a-matching-prefetch-record
  if (mResolved) {
    return;
  }
  // aRec is the record that changed; if it's not the one that unblocked us,
  // re-checking is still correct but wasted work, so bail out early unless
  // aRec itself could be relevant to mURI.
  if (aRec && aRec->State() != PrefetchState::Completed &&
      !aRec->IsExpectedToMatch(mURI)) {
    return;
  }
  if (PrefetchRecordParent* match = mWGP->FindMatchingPrefetchRecord(mURI)) {
    LOG_SPECRULES(
        ("PrefetchMatchWaiter::OnRecordStateChanged: this=%p found match=%p",
         this, match));
    Resolve(match);
    return;
  }
  // "If potentialRecords is empty, return null": give up as soon as no
  // ongoing record could still satisfy this navigation, instead of waiting
  // for aTimeout.
  if (!mWGP->HasPotentialPrefetchMatch(mURI)) {
    LOG_SPECRULES(
        ("PrefetchMatchWaiter::OnRecordStateChanged: this=%p no potential "
         "match remains, resolving nullptr",
         this));
    Resolve(nullptr);
  }
}

void PrefetchMatchWaiter::Resolve(PrefetchRecordParent* aMatch) {
  if (mResolved.exchange(true)) {
    return;  // already resolved — idempotent
  }
  if (mTimer) {
    mTimer->Cancel();
    mTimer = nullptr;
  }
  LOG_SPECRULES(
      ("PrefetchMatchWaiter::Resolve: this=%p match=%p", this, aMatch));
  mPromiseHolder.ResolveIfExists(RefPtr{aMatch}, __func__);
  mWGP->RemoveWaiter(this);
}

}  // namespace mozilla::dom
