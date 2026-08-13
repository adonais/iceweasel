/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SpeculationRuleSet_h
#define mozilla_dom_SpeculationRuleSet_h

#include "mozilla/Result.h"
#include "mozilla/ResultVariant.h"
#include "mozilla/UniquePtr.h"
#include "nsStringFwd.h"

class nsIGlobalObject;
class nsIURI;

namespace mozilla {
class ErrorResult;
}

namespace mozilla::dom {

class PrefetchCandidates;
enum class SpeculationRuleParseError;

class SpeculationRuleSet final {
 public:
  SpeculationRuleSet() = delete;
  SpeculationRuleSet(SpeculationRuleSet&) = delete;
  SpeculationRuleSet& operator=(const SpeculationRuleSet&) = delete;

  ~SpeculationRuleSet() = default;
  static void operator delete(void* aSpeculationRules);

  static Result<UniquePtr<SpeculationRuleSet>, SpeculationRuleParseError> Parse(
      const nsACString& aSource, nsIURI* aDocumentBaseUri, nsIURI* aBaseUri);

  static void ReportParseError(nsIGlobalObject* aGlobal,
                               SpeculationRuleParseError aError);

  void ConsiderLoads(PrefetchCandidates* aCandidates);
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_SpeculationRuleSet_h
