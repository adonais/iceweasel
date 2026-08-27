/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PrefetchRecordChild_h
#define mozilla_dom_PrefetchRecordChild_h

#include "mozilla/dom/PPrefetchRecordChild.h"
#include "mozilla/dom/PrefetchTypes.h"

namespace mozilla::dom {

// Content-side actor for a speculation rules prefetch record.
//
// Lightweight handle: stores only the URL and anonymization policy needed by
// the spec's "prefetch record is still being speculated" garbage-collection
// algorithm:
// https://wicg.github.io/nav-speculation/prefetch.html#prefetch-record-still-being-speculated
// Authoritative state (state, redirect chain, expiry, partition keys) lives
// on the parent-side PrefetchRecordParent.
//
// Spec: https://wicg.github.io/nav-speculation/prefetch.html#prefetch-record
class PrefetchRecordChild final : public PPrefetchRecordChild {
 public:
  NS_INLINE_DECL_REFCOUNTING(PrefetchRecordChild, override)

  PrefetchRecordChild(nsIURI* aURL, PrefetchAnonymizationPolicy aPolicy);

  nsIURI* URL() const { return mURL; }
  PrefetchAnonymizationPolicy AnonymizationPolicy() const {
    return mAnonPolicy;
  }

  // TODO: wire to SpeculationRulesManager::RemoveRecord.
  void ActorDestroy(ActorDestroyReason aReason) override;

 private:
  ~PrefetchRecordChild() = default;

  nsCOMPtr<nsIURI> mURL;
  PrefetchAnonymizationPolicy mAnonPolicy;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PrefetchRecordChild_h
