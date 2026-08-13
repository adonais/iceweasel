/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/intl/Locale.h"
#include "mozilla/intl/LocaleService.h"
#include "mozilla/intl/Collator.h"
#include "mozilla/intl/FluentBindings.h"
#include "mozilla/intl/RegistryBindings.h"

using namespace mozilla::intl;

TEST(Intl_Locale_LocaleService, CanonicalizeLanguageId)
{
  nsCString locale("en-US.POSIX");
  ASSERT_TRUE(LocaleService::CanonicalizeLanguageId(locale));
  ASSERT_TRUE(locale.EqualsLiteral("en-US"));

  locale.AssignLiteral("en-US_POSIX");
  ASSERT_TRUE(LocaleService::CanonicalizeLanguageId(locale));
  ASSERT_TRUE(locale.EqualsLiteral("en-US-posix"));

  locale.AssignLiteral("en-US-POSIX");
  ASSERT_TRUE(LocaleService::CanonicalizeLanguageId(locale));
  ASSERT_TRUE(locale.EqualsLiteral("en-US-posix"));

  locale.AssignLiteral("C");
  ASSERT_FALSE(LocaleService::CanonicalizeLanguageId(locale));
  ASSERT_TRUE(locale.EqualsLiteral("und"));

  locale.AssignLiteral("");
  ASSERT_FALSE(LocaleService::CanonicalizeLanguageId(locale));
  ASSERT_TRUE(locale.EqualsLiteral("und"));
}

TEST(Intl_Locale_LocaleService, GetAppLocalesAsBCP47)
{
  nsTArray<nsCString> appLocales;
  LocaleService::GetInstance()->GetAppLocalesAsBCP47(appLocales);

  ASSERT_FALSE(appLocales.IsEmpty());
}

TEST(Intl_Locale_LocaleService, GetAppLocalesAsLangTags)
{
  nsTArray<nsCString> appLocales;
  LocaleService::GetInstance()->GetAppLocalesAsLangTags(appLocales);

  ASSERT_FALSE(appLocales.IsEmpty());
}

TEST(Intl_Locale_LocaleService, GetAppLocalesAsLangTags_lastIsPresent)
{
  nsAutoCString lastFallbackLocale;
  LocaleService::GetInstance()->GetLastFallbackLocale(lastFallbackLocale);

  nsTArray<nsCString> appLocales;
  LocaleService::GetInstance()->GetAppLocalesAsLangTags(appLocales);

  ASSERT_TRUE(appLocales.Contains(lastFallbackLocale));
}

TEST(Intl_Locale_LocaleService, GetAppLocaleAsLangTag)
{
  nsTArray<nsCString> appLocales;
  LocaleService::GetInstance()->GetAppLocalesAsLangTags(appLocales);

  nsAutoCString locale;
  LocaleService::GetInstance()->GetAppLocaleAsLangTag(locale);

  ASSERT_TRUE(appLocales[0] == locale);
}

TEST(Intl_Locale_LocaleService, GetEllipsis)
{
  nsAutoString ellipsis;
  LocaleService::GetInstance()->GetEllipsis(ellipsis);

  ASSERT_TRUE(ellipsis == u"…");
}

TEST(Intl_Locale_LocaleService, GetRegionalPrefsLocales)
{
  nsTArray<nsCString> rpLocales;
  LocaleService::GetInstance()->GetRegionalPrefsLocales(rpLocales);

  int32_t len = rpLocales.Length();
  ASSERT_TRUE(len > 0);
}

TEST(Intl_Locale_LocaleService, GetWebExposedLocales)
{
  const nsTArray<nsCString> spoofLocale{"de"_ns};
  LocaleService::GetInstance()->SetAvailableLocales(spoofLocale);
  LocaleService::GetInstance()->SetRequestedLocales(spoofLocale);

  nsTArray<nsCString> pvLocales;

  mozilla::Preferences::SetInt("privacy.spoof_english", 0);
  LocaleService::GetInstance()->GetWebExposedLocales(pvLocales);
  ASSERT_TRUE(pvLocales.Length() > 0);
  ASSERT_TRUE(pvLocales[0].Equals("de"_ns));

  mozilla::Preferences::SetCString("intl.locale.privacy.web_exposed", "zh-TW");
  LocaleService::GetInstance()->GetWebExposedLocales(pvLocales);
  ASSERT_TRUE(pvLocales.Length() > 0);
  ASSERT_TRUE(pvLocales[0].Equals("zh-TW"_ns));

  mozilla::Preferences::SetBool("privacy.resistFingerprinting", true);
  mozilla::Preferences::SetInt("privacy.spoof_english", 2);
  LocaleService::GetInstance()->GetWebExposedLocales(pvLocales);
  ASSERT_EQ(1u, pvLocales.Length());
  ASSERT_TRUE(pvLocales[0].Equals("en-US"_ns));

  mozilla::Preferences::ClearUser("privacy.spoof_english");
  mozilla::Preferences::ClearUser("privacy.resistFingerprinting");
  mozilla::Preferences::ClearUser("intl.locale.privacy.web_exposed");
}

TEST(Intl_Locale_LocaleService, GetRequestedLocales)
{
  nsTArray<nsCString> reqLocales;
  LocaleService::GetInstance()->GetRequestedLocales(reqLocales);

  int32_t len = reqLocales.Length();
  ASSERT_TRUE(len > 0);
}

TEST(Intl_Locale_LocaleService, GetAvailableLocales)
{
  nsTArray<nsCString> availableLocales;
  LocaleService::GetInstance()->GetAvailableLocales(availableLocales);

  int32_t len = availableLocales.Length();
  ASSERT_TRUE(len > 0);
}

TEST(Intl_Locale_LocaleService, GetPackagedLocales)
{
  nsTArray<nsCString> packagedLocales;
  LocaleService::GetInstance()->GetPackagedLocales(packagedLocales);

  int32_t len = packagedLocales.Length();
  ASSERT_TRUE(len > 0);
}

TEST(Intl_Locale_LocaleService, GetDefaultLocale)
{
  nsAutoCString locStr;
  LocaleService::GetInstance()->GetDefaultLocale(locStr);

  ASSERT_FALSE(locStr.IsEmpty());
  Locale loc;
  ASSERT_TRUE(LocaleParser::TryParse(locStr, loc).isOk());
}

TEST(Intl_Locale_LocaleService, IsAppLocaleRTL)
{
  mozilla::Preferences::SetCString("intl.l10n.pseudo", "bidi");
  ASSERT_TRUE(LocaleService::GetInstance()->IsAppLocaleRTL());
  mozilla::Preferences::ClearUser("intl.l10n.pseudo");
}

TEST(Intl_Locale_LocaleService, AlwaysAppendAccesskeys)
{
  ASSERT_FALSE(LocaleService::GetInstance()->AlwaysAppendAccesskeys());
}

TEST(Intl_Locale_LocaleService, InsertSeparatorBeforeAccesskeys)
{
  ASSERT_TRUE(LocaleService::GetInstance()->InsertSeparatorBeforeAccesskeys());
}

namespace {
// foo.ftl: 8 of 10 messages translated (ratio 0.8); "msg-a" is fully missing
// and "msg-b" is missing its "label" attribute.
constexpr auto kCoverageJson =
    R"({"browser/browser/foo.ftl":{"total":10,"missing":["msg-a",["msg-b","label"]]}})"_ns;

struct AutoCoverage {
  explicit AutoCoverage(const nsACString& aJson) {
    EXPECT_TRUE(
        mozilla::intl::ffi::l10nregistry_set_coverage_for_testing(&aJson));
  }
  ~AutoCoverage() { mozilla::intl::ffi::l10nregistry_clear_coverage_cache(); }
};
}  // namespace

TEST(Intl_Locale_LocaleService, IsLocalizedEnough_NoCoverageData)
{
  AutoCoverage coverage(kCoverageJson);
  bool result = false;
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->IsLocalizedEnough(
      "browser/browser/other.ftl"_ns, ""_ns, 1.0, &result)));
  ASSERT_TRUE(result);
}

TEST(Intl_Locale_LocaleService, IsLocalizedEnough_Threshold)
{
  AutoCoverage coverage(kCoverageJson);
  bool result = false;

  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->IsLocalizedEnough(
      "browser/browser/foo.ftl"_ns, ""_ns, 0.7, &result)));
  ASSERT_TRUE(result);

  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->IsLocalizedEnough(
      "browser/browser/foo.ftl"_ns, ""_ns, 0.9, &result)));
  ASSERT_FALSE(result);
}

TEST(Intl_Locale_LocaleService, IsLocalizedEnough_OverridePref)
{
  AutoCoverage coverage(kCoverageJson);
  constexpr auto kPref = "intl.l10n.coverage.test-override"_ns;
  bool result = false;

  mozilla::Preferences::SetBool(kPref.get(), true);
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->IsLocalizedEnough(
      "browser/browser/foo.ftl"_ns, kPref, 0.9, &result)));
  ASSERT_TRUE(result);

  mozilla::Preferences::SetBool(kPref.get(), false);
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->IsLocalizedEnough(
      "browser/browser/foo.ftl"_ns, kPref, 0.9, &result)));
  ASSERT_FALSE(result);

  mozilla::Preferences::ClearUser(kPref.get());
}

TEST(Intl_Locale_LocaleService, AreMessagesLocalized)
{
  AutoCoverage coverage(kCoverageJson);
  bool result = false;

  nsTArray<nsCString> translated{"msg-c"_ns};
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->AreMessagesLocalized(
      "browser/browser/foo.ftl"_ns, translated, ""_ns, &result)));
  ASSERT_TRUE(result);

  nsTArray<nsCString> missing{"msg-a"_ns};
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->AreMessagesLocalized(
      "browser/browser/foo.ftl"_ns, missing, ""_ns, &result)));
  ASSERT_FALSE(result);

  // "msg-b" is fully present except for one attribute; strict mode fails it.
  nsTArray<nsCString> missingAttr{"msg-b"_ns};
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->AreMessagesLocalized(
      "browser/browser/foo.ftl"_ns, missingAttr, ""_ns, &result)));
  ASSERT_FALSE(result);

  nsTArray<nsCString> mixed{"msg-c"_ns, "msg-a"_ns};
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->AreMessagesLocalized(
      "browser/browser/foo.ftl"_ns, mixed, ""_ns, &result)));
  ASSERT_FALSE(result);
}

TEST(Intl_Locale_LocaleService, AreMessagesLocalized_NoCoverageData)
{
  AutoCoverage coverage(kCoverageJson);
  nsTArray<nsCString> ids{"msg-a"_ns};

  bool result = false;
  ASSERT_TRUE(NS_SUCCEEDED(LocaleService::GetInstance()->AreMessagesLocalized(
      "browser/browser/other.ftl"_ns, ids, ""_ns, &result)));
  ASSERT_TRUE(result);
}
