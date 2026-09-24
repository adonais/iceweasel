/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/dom/SpeechRecognitionModelMapping.h"

using namespace mozilla;

TEST(SpeechModelMapping, LocaleNegotiationRoutesToExpectedModel)
{
  struct TestCase {
    const char* mRequested;
    const char* mExpectedModel;
    const char* mExpectedLocale;
  };
  constexpr TestCase kTestCases[] = {
      {"en-US", "english", "en"},         {"en-AU", "english", "en"},
      {"es-MX", "multilingual", "es"},    {"es-ES", "multilingual", "es-ES"},
      {"FR-fr", "multilingual", "fr-FR"},
  };

  for (const auto& test : kTestCases) {
    SCOPED_TRACE(test.mRequested);
    Maybe<dom::SpeechModelMatch> model =
        dom::SpeechModelFor(nsDependentCString(test.mRequested));
    ASSERT_TRUE(model.isSome());
    EXPECT_STREQ(model->mId.get(), test.mExpectedModel);
    EXPECT_STREQ(model->mLocale.get(), test.mExpectedLocale);
  }
}

TEST(SpeechModelMapping, UnsupportedLanguageHasNoModel)
{
  EXPECT_TRUE(dom::SpeechModelFor("xx-XX"_ns).isNothing());
  EXPECT_TRUE(dom::SpeechModelFor("not a language tag"_ns).isNothing());
  EXPECT_TRUE(dom::SpeechModelFor(""_ns).isNothing());
}

TEST(SpeechModelMapping, DefaultModelLeavesLocaleUnset)
{
  dom::SpeechModelMatch model = dom::DefaultSpeechModel();
  EXPECT_STREQ(model.mId.get(), "english");
  EXPECT_TRUE(model.mLocale.IsEmpty());
}
