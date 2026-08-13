/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include "ContentAnalysisRuleParser.h"
#include "nsIContentAnalysis.h"
#include "nsString.h"
#include "nsTArray.h"

using namespace mozilla::contentanalysis;

namespace {

using AnalysisType = nsIContentAnalysisRequest::AnalysisType;

nsresult Parse(const char* aJSON,
               nsTArray<RefPtr<nsIContentAnalysisRule>>& aRules) {
  return ParseContentAnalysisRules(NS_ConvertUTF8toUTF16(aJSON), aRules);
}

// A valid two-rule config in the enterprise-console format.
constexpr const char* kSample = R"JSON({
  "DLPRules": {
    "Version": "2026-05-22T18:00:00Z",
    "Rules": [
      {
        "Name": "warn-ai-paste",
        "Enabled": true,
        "Actions": ["TextPaste", "FileUpload"],
        "Domains": ["chatgpt.com", "claude.ai", "gemini.google.com"],
        "Type": "warn",
        "Message": "Pasting work data into AI services may violate company policy."
      },
      {
        "Name": "block-cloud-uploads",
        "Enabled": true,
        "Actions": ["FileUpload"],
        "Domains": ["drive.google.com", "dropbox.com", "wetransfer.com"],
        "Type": "block"
      }
    ]
  }
})JSON";

}  // namespace

TEST(ContentAnalysisRuleParser, ParsesSampleConfig)
{
  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  ASSERT_EQ(Parse(kSample, rules), NS_OK);
  ASSERT_EQ(rules.Length(), 2u);

  // Rule 0: warn-ai-paste
  nsString name;
  ASSERT_EQ(rules[0]->GetName(name), NS_OK);
  EXPECT_TRUE(name.EqualsLiteral("warn-ai-paste"));

  nsTArray<uint32_t> ops;
  ASSERT_EQ(rules[0]->GetOperations(ops), NS_OK);
  ASSERT_EQ(ops.Length(), 2u);
  EXPECT_EQ(ops[0], static_cast<uint32_t>(AnalysisType::eBulkDataEntry));
  EXPECT_EQ(ops[1], static_cast<uint32_t>(AnalysisType::eFileAttached));

  nsTArray<nsString> domains;
  ASSERT_EQ(rules[0]->GetDomains(domains), NS_OK);
  ASSERT_EQ(domains.Length(), 3u);
  EXPECT_TRUE(domains[0].EqualsLiteral("chatgpt.com"));
  EXPECT_TRUE(domains[1].EqualsLiteral("claude.ai"));
  EXPECT_TRUE(domains[2].EqualsLiteral("gemini.google.com"));

  uint8_t verdict;
  ASSERT_EQ(rules[0]->GetVerdict(&verdict), NS_OK);
  EXPECT_EQ(verdict, nsIContentAnalysisRule::WARN);

  nsString message;
  ASSERT_EQ(rules[0]->GetMessage(message), NS_OK);
  EXPECT_TRUE(message.EqualsLiteral(
      "Pasting work data into AI services may violate company policy."));

  // Rule 1: block-cloud-uploads
  ASSERT_EQ(rules[1]->GetName(name), NS_OK);
  EXPECT_TRUE(name.EqualsLiteral("block-cloud-uploads"));

  ASSERT_EQ(rules[1]->GetOperations(ops), NS_OK);
  ASSERT_EQ(ops.Length(), 1u);
  EXPECT_EQ(ops[0], static_cast<uint32_t>(AnalysisType::eFileAttached));

  ASSERT_EQ(rules[1]->GetVerdict(&verdict), NS_OK);
  EXPECT_EQ(verdict, nsIContentAnalysisRule::BLOCK);

  ASSERT_EQ(rules[1]->GetMessage(message), NS_OK);
  EXPECT_TRUE(message.IsEmpty());
}

TEST(ContentAnalysisRuleParser, OmitsDisabledRules)
{
  constexpr const char* kJSON = R"JSON({
    "DLPRules": { "Rules": [
      { "Name": "off", "Enabled": false, "Actions": ["Print"], "Type": "block" },
      { "Name": "on", "Enabled": true, "Actions": ["TextPaste"], "Type": "warn" }
    ] }
  })JSON";

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  ASSERT_EQ(Parse(kJSON, rules), NS_OK);
  ASSERT_EQ(rules.Length(), 1u);
  nsString name;
  ASSERT_EQ(rules[0]->GetName(name), NS_OK);
  EXPECT_TRUE(name.EqualsLiteral("on"));
  nsTArray<uint32_t> ops;
  ASSERT_EQ(rules[0]->GetOperations(ops), NS_OK);
  ASSERT_EQ(ops.Length(), 1u);
  EXPECT_EQ(ops[0], static_cast<uint32_t>(AnalysisType::eBulkDataEntry));
  uint8_t verdict;
  ASSERT_EQ(rules[0]->GetVerdict(&verdict), NS_OK);
  EXPECT_EQ(verdict, nsIContentAnalysisRule::WARN);
}

TEST(ContentAnalysisRuleParser, VerdictIsCaseInsensitive)
{
  constexpr const char* kJSON = R"JSON({
    "DLPRules": { "Rules": [
      { "Name": "r", "Enabled": true, "Actions": ["Print"], "Type": "BLOCK" }
    ] }
  })JSON";

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  ASSERT_EQ(Parse(kJSON, rules), NS_OK);
  ASSERT_EQ(rules.Length(), 1u);
  uint8_t verdict;
  ASSERT_EQ(rules[0]->GetVerdict(&verdict), NS_OK);
  EXPECT_EQ(verdict, nsIContentAnalysisRule::BLOCK);
}

TEST(ContentAnalysisRuleParser, EmptyRuleSet)
{
  constexpr const char* kJSON = R"JSON({ "DLPRules": { "Rules": [] } })JSON";
  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  ASSERT_EQ(Parse(kJSON, rules), NS_OK);
  EXPECT_EQ(rules.Length(), 0u);
}

TEST(ContentAnalysisRuleParser, RejectsUnknownAction)
{
  constexpr const char* kJSON = R"JSON({
    "DLPRules": { "Rules": [
      { "Name": "r", "Enabled": true, "Actions": ["Teleport"], "Type": "block" }
    ] }
  })JSON";

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  EXPECT_EQ(Parse(kJSON, rules), NS_ERROR_INVALID_ARG);
  // Nothing is appended on failure.
  EXPECT_EQ(rules.Length(), 0u);
}

TEST(ContentAnalysisRuleParser, RejectsUnknownType)
{
  constexpr const char* kJSON = R"JSON({
    "DLPRules": { "Rules": [
      { "Name": "r", "Enabled": true, "Actions": ["Print"], "Type": "quarantine" }
    ] }
  })JSON";

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  EXPECT_EQ(Parse(kJSON, rules), NS_ERROR_INVALID_ARG);
}

TEST(ContentAnalysisRuleParser, RejectsMissingRequiredName)
{
  constexpr const char* kJSON = R"JSON({
    "DLPRules": { "Rules": [
      { "Enabled": true, "Actions": ["Print"], "Type": "block" }
    ] }
  })JSON";

  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  EXPECT_EQ(Parse(kJSON, rules), NS_ERROR_INVALID_ARG);
}

TEST(ContentAnalysisRuleParser, RejectsMissingDLPRules)
{
  constexpr const char* kJSON = R"JSON({ "SomethingElse": {} })JSON";
  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  EXPECT_EQ(Parse(kJSON, rules), NS_ERROR_INVALID_ARG);
}

TEST(ContentAnalysisRuleParser, RejectsMalformedJSON)
{
  nsTArray<RefPtr<nsIContentAnalysisRule>> rules;
  EXPECT_EQ(Parse("{ not valid json", rules), NS_ERROR_INVALID_ARG);
}
