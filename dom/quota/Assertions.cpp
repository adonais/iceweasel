/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Assertions.h"

#include "mozilla/Assertions.h"
#include "mozilla/DataMutex.h"
#include "mozilla/dom/quota/QuotaManager.h"
#include "nsIThread.h"
#include "nsTHashMap.h"

namespace mozilla::dom::quota {

bool ShouldReportUnderflow(const nsACString& aContext) {
  static StaticDataMutex<nsTHashMap<nsCStringHashKey, uint32_t>> sCounters(
      "ShouldReportUnderflow::sCounters");

  auto counters = sCounters.Lock();
  uint32_t& counter = counters->LookupOrInsert(aContext, 0u);

  // To not flood the product maintenance diagnostics, this predicate
  // qualifies an error by returning true only when counter and 1 + counter
  // bits are like 0111... and 1000..., i.e. when counter is one less than a
  // power of two.
  // Each distinct context gets its own counter, so a chronically-underflowing
  // field can't suppress the first occurrences of a different, rarer one.
  // This is a copy paste from LSSnapshot::SetItem.
  const bool result = 0u == (counter & (1u + counter));
  ++counter;
  return result;
}

bool IsOnIOThread() {
  QuotaManager* quotaManager = QuotaManager::Get();
  NS_ASSERTION(quotaManager, "Must have a manager here!");

  bool currentThread;
  return NS_SUCCEEDED(
             quotaManager->IOThread()->IsOnCurrentThread(&currentThread)) &&
         currentThread;
}

void AssertIsOnIOThread() {
  NS_ASSERTION(IsOnIOThread(), "Running on the wrong thread!");
}

void DiagnosticAssertIsOnIOThread() { MOZ_DIAGNOSTIC_ASSERT(IsOnIOThread()); }

void AssertCurrentThreadOwnsQuotaMutex() {
#ifdef DEBUG
  QuotaManager* quotaManager = QuotaManager::Get();
  NS_ASSERTION(quotaManager, "Must have a manager here!");

  quotaManager->AssertCurrentThreadOwnsQuotaMutex();
#endif
}

}  // namespace mozilla::dom::quota
