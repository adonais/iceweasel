/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SpeculationRulesManager.h"

#include "mozilla/Maybe.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/PrefetchIPCTypes.h"
#include "mozilla/dom/PrefetchLog.h"
#include "mozilla/dom/PrefetchTypes.h"
#include "mozilla/dom/ReferrerInfo.h"
#include "mozilla/dom/WindowGlobalChild.h"
#include "mozilla/dom/speculationrules_ffi_generated.h"
#include "nsNetUtil.h"
#include "nsTHashSet.h"

namespace mozilla::dom {

void SpeculationRulesManager::RemoveRecord(PrefetchRecordChild* aRecord) {
  mPrefetchRecords.RemoveElement(aRecord);
}

void SpeculationRulesManager::StartPrefetch(Document* aDocument,
                                            const PrefetchCandidate& aCand) {
  WindowGlobalChild* wgc = aDocument->GetWindowGlobalChild();
  if (!wgc || wgc->IsClosed()) {
    return;
  }

  nsCOMPtr<nsIURI> uri;
  if (NS_FAILED(NS_NewURI(getter_AddRefs(uri), aCand.url))) {
    LOG_SPECRULES_WARN(
        ("StartPrefetch: invalid candidate URL '%s'", aCand.url.get()));
    return;
  }

  nsCOMPtr<nsIReferrerInfo> referrerInfo =
      new ReferrerInfo(aDocument->GetDocumentURIAsReferrer(),
                       static_cast<ReferrerPolicy>(aCand.referrer_policy));

  nsString noVarySearchHint;
  if (!aCand.no_vary_search_hint.IsVoid()) {
    CopyUTF8toUTF16(aCand.no_vary_search_hint, noVarySearchHint);
  }

  nsTArray<Maybe<nsString>> tags;
  for (const nsCString& tag : aCand.tags) {
    tags.AppendElement(tag.IsVoid() ? Nothing()
                                    : Some(NS_ConvertUTF8toUTF16(tag)));
  }

  const bool anonymizeClientIP = false;

  SpeculativePrefetchArgs args(WrapNotNull(uri.get()), referrerInfo,
                               noVarySearchHint, anonymizeClientIP,
                               std::move(tags));

  auto actor =
      MakeRefPtr<PrefetchRecordChild>(uri, PrefetchAnonymizationPolicy::None);

  if (!wgc->SendPPrefetchRecordConstructor(actor.get(), args)) {
    LOG_SPECRULES(("StartPrefetch: IPC send failed"));
    return;
  }

  mPrefetchRecords.AppendElement(std::move(actor));
}

void SpeculationRulesManager::CancelStalePrefetches(
    const nsTArray<PrefetchCandidate>& aStillSpeculated) {
  nsTHashSet<nsCString> stillSpeculatedUrls;
  for (const PrefetchCandidate& cand : aStillSpeculated) {
    stillSpeculatedUrls.Insert(cand.url);
  }

  nsTArray<RefPtr<PrefetchRecordChild>> stale;
  mPrefetchRecords.RemoveElementsBy(
      [&](const RefPtr<PrefetchRecordChild>& aRecord) {
        nsAutoCString spec;
        if (aRecord->URL()) {
          aRecord->URL()->GetSpec(spec);
        }
        if (stillSpeculatedUrls.Contains(spec)) {
          return false;
        }
        stale.AppendElement(aRecord);
        return true;
      });

  // Cancel and destroy the stale actors only after mPrefetchRecords has been
  // fully updated above: Send__delete__ synchronously runs ActorDestroy,
  // which re-enters SpeculationRulesManager::RemoveRecord and mutates
  // mPrefetchRecords, which RemoveElementsBy above does not tolerate while
  // it's still iterating.
  for (const RefPtr<PrefetchRecordChild>& record : stale) {
    nsAutoCString spec;
    if (record->URL()) {
      record->URL()->GetSpec(spec);
    }
    LOG_SPECRULES(("CancelStalePrefetches: canceling %s", spec.get()));
    record->SendCancel();
    PrefetchRecordChild::Send__delete__(record);
  }
}

}  // namespace mozilla::dom
