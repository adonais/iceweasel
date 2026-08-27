/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SpeculationRulesManager_h
#define mozilla_dom_SpeculationRulesManager_h

#include "mozilla/dom/PrefetchRecordChild.h"
#include "nsTArray.h"

namespace mozilla::dom {

class Document;
struct PrefetchCandidate;

// DOM-side (content process) orchestrator for Speculation Rules prefetch.
// Owned by Document via UniquePtr (lazy). Holds the canonical content-side
// list of active PrefetchRecordChild handles.
//
// Spec: https://wicg.github.io/nav-speculation/prefetch.html
class SpeculationRulesManager final {
 public:
  SpeculationRulesManager() = default;
  ~SpeculationRulesManager() = default;

  // Drop a record handle. Called from PrefetchRecordChild::ActorDestroy.
  void RemoveRecord(PrefetchRecordChild* aRecord);

  // Create a PPrefetchRecord actor pair for aCandidate
  void StartPrefetch(Document* aDocument, const PrefetchCandidate& aCandidate);

  // Cancel and discard any tracked record whose URL is not present in
  // aStillSpeculated. Called from SpeculationRules::InnerConsiderLoads Step 4.
  // Spec:
  // https://wicg.github.io/nav-speculation/prefetch.html#prefetch-record-still-being-speculated
  void CancelStalePrefetches(
      const nsTArray<PrefetchCandidate>& aStillSpeculated);

 private:
  // Active content-side prefetch handles for this document.
  // Spec: https://wicg.github.io/nav-speculation/prefetch.html#prefetch-record
  nsTArray<RefPtr<PrefetchRecordChild>> mPrefetchRecords;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_SpeculationRulesManager_h
