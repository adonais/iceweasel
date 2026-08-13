/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_contentanalysis_ContentAnalysisRuleParser_h
#define mozilla_contentanalysis_ContentAnalysisRuleParser_h

#include "mozilla/RefPtr.h"
#include "nsIContentAnalysis.h"
#include "nsString.h"
#include "nsTArray.h"

namespace mozilla::contentanalysis {

// Concrete nsIContentAnalysisRule used to hand rules to the JS runner.
class ContentAnalysisRule final : public nsIContentAnalysisRule {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICONTENTANALYSISRULE

  ContentAnalysisRule(const nsAString& aName, nsTArray<uint32_t>&& aOperations,
                      nsTArray<nsString>&& aDomains,
                      nsTArray<nsString>&& aContentPatterns, uint8_t aVerdict,
                      const nsAString& aMessage)
      : mName(aName),
        mOperations(std::move(aOperations)),
        mDomains(std::move(aDomains)),
        mContentPatterns(std::move(aContentPatterns)),
        mVerdict(aVerdict),
        mMessage(aMessage) {}

 private:
  ~ContentAnalysisRule() = default;

  nsString mName;
  nsTArray<uint32_t> mOperations;
  nsTArray<nsString> mDomains;
  nsTArray<nsString> mContentPatterns;
  uint8_t mVerdict;
  nsString mMessage;
};

// Parse a rules configuration JSON string into content analysis rule
// objects, setting them into aOutRules. Disabled rules are omitted.
nsresult ParseContentAnalysisRules(
    const nsAString& aJSON,
    nsTArray<RefPtr<nsIContentAnalysisRule>>& aOutRules);

}  // namespace mozilla::contentanalysis

#endif  // mozilla_contentanalysis_ContentAnalysisRuleParser_h
