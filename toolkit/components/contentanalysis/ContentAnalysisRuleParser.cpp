/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "ContentAnalysisRuleParser.h"

#include "mozilla/dom/ContentAnalysisBinding.h"
#include "mozilla/Logging.h"

namespace mozilla::contentanalysis {

// Defined in ContentAnalysis.cpp.
extern LazyLogModule gContentAnalysisLog;

NS_IMPL_ISUPPORTS(ContentAnalysisRule, nsIContentAnalysisRule)

NS_IMETHODIMP ContentAnalysisRule::GetName(nsAString& aName) {
  aName = mName;
  return NS_OK;
}

NS_IMETHODIMP ContentAnalysisRule::GetOperations(
    nsTArray<uint32_t>& aOperations) {
  aOperations = mOperations.Clone();
  return NS_OK;
}

NS_IMETHODIMP ContentAnalysisRule::GetDomains(nsTArray<nsString>& aDomains) {
  aDomains = mDomains.Clone();
  return NS_OK;
}

NS_IMETHODIMP ContentAnalysisRule::GetContentPatterns(
    nsTArray<nsString>& aContentPatterns) {
  aContentPatterns = mContentPatterns.Clone();
  return NS_OK;
}

NS_IMETHODIMP ContentAnalysisRule::GetVerdict(uint8_t* aVerdict) {
  *aVerdict = mVerdict;
  return NS_OK;
}

NS_IMETHODIMP ContentAnalysisRule::GetMessage(nsAString& aMessage) {
  aMessage = mMessage;
  return NS_OK;
}

namespace {

using AnalysisType = nsIContentAnalysisRequest::AnalysisType;

// Map an enterprise-console action name to its value. Returns false for an
// unrecognized name.
bool ActionToAnalysisType(const nsAString& aAction, uint32_t* aOut) {
  if (aAction.LowerCaseEqualsLiteral("filedownload")) {
    *aOut = static_cast<uint32_t>(AnalysisType::eFileDownloaded);
  } else if (aAction.LowerCaseEqualsLiteral("fileupload")) {
    *aOut = static_cast<uint32_t>(AnalysisType::eFileAttached);
  } else if (aAction.LowerCaseEqualsLiteral("textpaste")) {
    *aOut = static_cast<uint32_t>(AnalysisType::eBulkDataEntry);
  } else if (aAction.LowerCaseEqualsLiteral("print")) {
    *aOut = static_cast<uint32_t>(AnalysisType::ePrint);
  } else {
    MOZ_LOG(gContentAnalysisLog, LogLevel::Error,
            ("Unrecognized analysis type \"%s\"",
             NS_ConvertUTF16toUTF8(aAction).get()));
    return false;
  }
  return true;
}

// Map the rule's "Type" (case-insensitive) to the nsIContentAnalysisRule
// verdict discriminant. Returns false for an unrecognized type.
bool TypeToVerdict(const nsAString& aType, uint8_t* aOut) {
  if (aType.LowerCaseEqualsLiteral("report")) {
    *aOut = nsIContentAnalysisRule::REPORT;
  } else if (aType.LowerCaseEqualsLiteral("warn")) {
    *aOut = nsIContentAnalysisRule::WARN;
  } else if (aType.LowerCaseEqualsLiteral("block")) {
    *aOut = nsIContentAnalysisRule::BLOCK;
  } else {
    MOZ_LOG(
        gContentAnalysisLog, LogLevel::Error,
        ("Unrecognized rule type \"%s\"", NS_ConvertUTF16toUTF8(aType).get()));
    return false;
  }
  return true;
}

nsTArray<nsString> ToStringArray(const dom::Sequence<nsString>& aSeq) {
  nsTArray<nsString> out;
  out.AppendElements(aSeq);
  return out;
}

}  // namespace

nsresult ParseContentAnalysisRules(
    const nsAString& aJSON,
    nsTArray<RefPtr<nsIContentAnalysisRule>>& aOutRules) {
  dom::ContentAnalysisConfigJSON config;
  if (!config.Init(aJSON)) {
    return NS_ERROR_INVALID_ARG;
  }

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  // Most rules will probably be enabled, so set the capacity up front.
  rules.SetCapacity(config.mDLPRules.mRules.Length());
  for (const auto& jsonRule : config.mDLPRules.mRules) {
    if (!jsonRule.mEnabled) {
      continue;
    }

    nsTArray<uint32_t> operations;
    for (const auto& action : jsonRule.mActions) {
      uint32_t op;
      if (!ActionToAnalysisType(action, &op)) {
        return NS_ERROR_INVALID_ARG;
      }
      operations.AppendElement(op);
    }

    uint8_t verdict;
    if (!TypeToVerdict(jsonRule.mType, &verdict)) {
      return NS_ERROR_INVALID_ARG;
    }

    rules.AppendElement(MakeRefPtr<ContentAnalysisRule>(
        jsonRule.mName, std::move(operations), ToStringArray(jsonRule.mDomains),
        ToStringArray(jsonRule.mContentPatterns), verdict, jsonRule.mMessage));
  }

  aOutRules.AppendElements(std::move(rules));
  return NS_OK;
}

}  // namespace mozilla::contentanalysis
