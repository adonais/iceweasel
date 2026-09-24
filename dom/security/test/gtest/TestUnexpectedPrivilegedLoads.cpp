/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <tuple>

#include "TelemetryFixture.h"
#include "gtest/gtest.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/Preferences.h"
#include "mozilla/RefPtr.h"
#include "mozilla/glean/DomSecurityMetrics.h"
#include "mozilla/glean/fog_ffi_generated.h"
#include "nsContentSecurityManager.h"
#include "nsContentSecurityUtils.h"
#include "nsContentUtils.h"
#include "nsIContentPolicy.h"
#include "nsILoadInfo.h"
#include "nsNetUtil.h"
#include "nsStringFwd.h"

using namespace mozilla;

extern Atomic<bool, mozilla::Relaxed> sJSHacksChecked;
extern Atomic<bool, mozilla::Relaxed> sJSHacksPresent;
extern Atomic<bool, mozilla::Relaxed> sCSSHacksChecked;
extern Atomic<bool, mozilla::Relaxed> sCSSHacksPresent;

TEST_F(TelemetryTestFixture, UnexpectedPrivilegedLoadsTelemetryTest) {
  // Reset FOG to clear any events recorded by other tests.
  const nsCString empty;
  mozilla::glean::impl::fog_test_reset(&empty, &empty);

  // Enable telemetry pref.
  bool prefDefault = Preferences::GetBool(
      "dom.security.unexpected_system_load_telemetry_enabled");
  Preferences::SetBool("dom.security.unexpected_system_load_telemetry_enabled",
                       true);

  // Disable JS/CSS Hacks Detection, which would consider this current profile
  // as uninteresting for our measurements:
  bool origJSHacksPresent = sJSHacksPresent;
  bool origJSHacksChecked = sJSHacksChecked;
  sJSHacksPresent = false;
  sJSHacksChecked = true;
  bool origCSSHacksPresent = sCSSHacksPresent;
  bool origCSSHacksChecked = sCSSHacksChecked;
  sCSSHacksPresent = false;
  sCSSHacksChecked = true;

  struct testResults {
    nsCString fileinfo;
    nsCString extraValueContenttype;
    nsCString extraValueRemotetype;
    nsCString extraValueFiledetails;
    nsCString extraValueRedirects;
  };

  struct testCasesAndResults {
    nsCString urlstring;
    nsContentPolicyType contentType;
    nsCString remoteType;
    testResults expected;
  };

  // some cases from TestFilenameEvalParser
  // no need to replicate all scenarios?!
  testCasesAndResults myTestCases[] = {
      {"chrome://firegestures/content/browser.js"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "web"_ns,
       {"chromeuri"_ns, "TYPE_SCRIPT"_ns, "web"_ns,
        "chrome://firegestures/content/browser.js"_ns, ""_ns}},
      {"resource://firegestures/content/browser.js"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "web"_ns,
       {"resourceuri"_ns, "TYPE_SCRIPT"_ns, "web"_ns,
        "resource://firegestures/content/browser.js"_ns, ""_ns}},
      {// test that we don't report blob details
       // ..and test that we strip of URLs from remoteTypes
       "blob://000-000"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "webIsolated=https://blob.example"_ns,
       {"bloburi"_ns, "TYPE_SCRIPT"_ns, "webIsolated"_ns, "unknown"_ns, ""_ns}},
      {// test for cases where finalURI is null, due to a broken nested URI
       // .. like malformed moz-icon URLs
       "moz-icon:blahblah"_ns,
       nsContentPolicyType::TYPE_DOCUMENT,
       "web"_ns,
       {"other"_ns, "TYPE_DOCUMENT"_ns, "web"_ns, "unknown"_ns, ""_ns}},
      {// we dont report data urls
       // ..and test that we strip of URLs from remoteTypes
       "data://blahblahblah"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "webCOOP+COEP=https://data.example"_ns,
       {"dataurl"_ns, "TYPE_SCRIPT"_ns, "webCOOP+COEP"_ns, "unknown"_ns,
        ""_ns}},
      {// handle data URLs for webextension content scripts differently
       // .. by noticing their annotation
       "data:text/css;extension=style;charset=utf-8,/* some css here */"_ns,
       nsContentPolicyType::TYPE_STYLESHEET,
       "web"_ns,
       {"dataurl-extension-contentstyle"_ns, "TYPE_STYLESHEET"_ns, "web"_ns,
        "unknown"_ns, ""_ns}},
      {// we only report file URLs on windows, where we can easily sanitize
       "file://c/users/tom/file.txt"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "web"_ns,
       {
#if defined(XP_WIN)
           "sanitizedWindowsURL"_ns, "TYPE_SCRIPT"_ns, "web"_ns,
           "file://.../file.txt"_ns, ""_ns

#else
           "other"_ns, "TYPE_SCRIPT"_ns, "web"_ns, "unknown"_ns, ""_ns
#endif
       }},
      {// test for one redirect
       "moz-extension://abcdefab-1234-4321-0000-abcdefabcdef/js/assets.js"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "web"_ns,
       {"extension_uri"_ns, "TYPE_SCRIPT"_ns, "web"_ns,
        // the extension-id is made-up, so the extension will report failure
        "moz-extension://[failed finding addon by host]/js/assets.js"_ns,
        "https"_ns}},
      {// test for cases where finalURI is empty
       ""_ns,
       nsContentPolicyType::TYPE_STYLESHEET,
       "web"_ns,
       {"other"_ns, "TYPE_STYLESHEET"_ns, "web"_ns, "unknown"_ns, ""_ns}},
      {// test for cases where finalURI is null, due to the struct layout, we'll
       // override the URL with nullptr in loop below.
       "URLWillResultInNullPtr"_ns,
       nsContentPolicyType::TYPE_SCRIPT,
       "web"_ns,
       {"other"_ns, "TYPE_SCRIPT"_ns, "web"_ns, "unknown"_ns, ""_ns}},
  };

  // Returns the value recorded for a given extra key, or an empty string if the
  // key is absent. The list of extra key/value pairs can be in any order.
  auto extraValue = [](const nsTArray<std::tuple<nsCString, nsCString>>& aExtra,
                       const nsACString& aKey) -> nsCString {
    for (const auto& entry : aExtra) {
      if (std::get<0>(entry).Equals(aKey)) {
        return std::get<1>(entry);
      }
    }
    return nsCString();
  };

  uint32_t i = 0;
  for (auto const& currentTest : myTestCases) {
    nsresult rv;
    nsCOMPtr<nsIURI> uri;

    // special-casing for a case where the uri is null
    if (!currentTest.urlstring.Equals("URLWillResultInNullPtr")) {
      NS_NewURI(getter_AddRefs(uri), currentTest.urlstring);
    }

    // We can't create channels for chrome: URLs unless they are in a chrome
    // registry that maps them into the actual destination URL (usually
    // file://). It seems that gtest don't have chrome manifest registered, so
    // we'll use a mockChannel with a mockUri.
    nsCOMPtr<nsIURI> mockUri;
    rv = NS_NewURI(getter_AddRefs(mockUri), "http://example.com"_ns);
    ASSERT_EQ(rv, NS_OK) << "Could not create mockUri";
    nsCOMPtr<nsIChannel> mockChannel;
    nsCOMPtr<nsIIOService> service = do_GetIOService();
    if (!service) {
      ASSERT_TRUE(false)
      << "Couldn't initialize IOService";
    }
    rv = service->NewChannelFromURI(
        mockUri, nullptr, nsContentUtils::GetSystemPrincipal(),
        nsContentUtils::GetSystemPrincipal(), 0, currentTest.contentType,
        getter_AddRefs(mockChannel));
    ASSERT_EQ(rv, NS_OK) << "Could not create a mock channel";
    nsCOMPtr<nsILoadInfo> mockLoadInfo = mockChannel->LoadInfo();

    // We're adding a redirect entry for one specific test
    if (currentTest.urlstring.EqualsASCII(
            "moz-extension://abcdefab-1234-4321-0000-abcdefabcdef/js/"
            "assets.js")) {
      nsCOMPtr<nsIURI> redirUri;
      NS_NewURI(getter_AddRefs(redirUri),
                "https://www.analytics.example/analytics.js"_ns);
      nsCOMPtr<nsIPrincipal> redirPrincipal =
          BasePrincipal::CreateContentPrincipal(redirUri, OriginAttributes());
      nsCOMPtr<nsIChannel> redirectChannel;
      (void)service->NewChannelFromURI(redirUri, nullptr, redirPrincipal,
                                       nullptr, 0, currentTest.contentType,
                                       getter_AddRefs(redirectChannel));

      mockLoadInfo->AppendRedirectHistoryEntry(redirectChannel, false);
    }

    auto remoteType = mozilla::dom::RemoteType::Parse(currentTest.remoteType);
    ASSERT_TRUE(remoteType);

    // this will record the event
    nsContentSecurityManager::MeasureUnexpectedPrivilegedLoads(mockLoadInfo,
                                                               uri, remoteType);

    // let's inspect the recorded Glean events
    auto optEvents =
        mozilla::glean::security::unexpected_load.TestGetValue().unwrap();
    ASSERT_TRUE(optEvents.isSome())
    << "Test event with value and extra must be present.";

    auto events = optEvents.extract();
    ASSERT_EQ(i + 1, events.Length())
        << "Each recorded test case must add exactly one event.";

    auto const& record = events[i];
    EXPECT_STREQ("security", record.mCategory.get());
    EXPECT_STREQ("unexpected_load", record.mName.get());

    // The filename's type is recorded in the `value` extra key.
    EXPECT_STREQ(currentTest.expected.fileinfo.get(),
                 extraValue(record.mExtra, "value"_ns).get())
        << "Reported value/fileinfo must equal expected value.";
    EXPECT_STREQ(currentTest.expected.extraValueContenttype.get(),
                 extraValue(record.mExtra, "contenttype"_ns).get())
        << "Reported contenttype must equal expected value.";
    EXPECT_STREQ(currentTest.expected.extraValueRemotetype.get(),
                 extraValue(record.mExtra, "remotetype"_ns).get())
        << "Reported remotetype must equal expected value.";
    EXPECT_STREQ(currentTest.expected.extraValueFiledetails.get(),
                 extraValue(record.mExtra, "filedetails"_ns).get())
        << "Reported filedetails must equal expected value.";
    EXPECT_STREQ(currentTest.expected.extraValueRedirects.get(),
                 extraValue(record.mExtra, "redirects"_ns).get())
        << "Reported redirects must equal expected value.";

    i++;
  }

  // Re-store JS/CSS hacks detection state
  sJSHacksPresent = origJSHacksPresent;
  sJSHacksChecked = origJSHacksChecked;
  sCSSHacksPresent = origCSSHacksPresent;
  sCSSHacksChecked = origCSSHacksChecked;

  // Restore telemetry pref
  Preferences::SetBool("dom.security.unexpected_system_load_telemetry_enabled",
                       prefDefault);
}
