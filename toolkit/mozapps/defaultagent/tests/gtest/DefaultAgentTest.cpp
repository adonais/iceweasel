/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "gtest/gtest.h"

#include <string>
#include <windows.h>
#include "common.h"
#include "nsCOMPtr.h"
#include "Registry.h"
#include "DefaultAgent.h"
#include "Telemetry.h"
#include "nsComponentManagerUtils.h"
#include "nsLiteralString.h"
#include "mozilla/Maybe.h"
#include "mozilla/glean/GleanPings.h"

using namespace mozilla::default_agent;

const wchar_t* REG_KEY = L"AppLastRunTime";
const wchar_t* DISABLE_TELEMETRY_REG_NAME = L"DisableTelemetry";
const char* DEFAULT_AGENT_CONTRACT_ID = "@mozilla.org/default-agent;1";

class DefaultAgentTest : public ::testing::Test {
 protected:
  void SetUp() override {
    m_lastRunTimestamp = 0;
    m_lastRunRegistryEntryExisted = false;
    m_lastRunRegisterEntryWasModified = false;
    // Save whatever the registry setting was...
    MaybeQwordResult lastRunTimeResult =
        RegistryGetValueQword(IsPrefixed::Prefixed, REG_KEY);
    if (!lastRunTimeResult.isErr()) {
      mozilla::Maybe<ULONGLONG> lastRunTimeMaybe = lastRunTimeResult.unwrap();
      if (lastRunTimeMaybe.isSome()) {
        m_lastRunRegistryEntryExisted = true;
        m_lastRunTimestamp = lastRunTimeMaybe.value();
      }
    }
  }

  void TearDown() override {
    if (m_lastRunRegisterEntryWasModified) {
      if (m_lastRunRegistryEntryExisted) {
        // Restore registry value
        mozilla::WindowsErrorResult<mozilla::Ok> writeResult =
            RegistrySetValueQword(IsPrefixed::Prefixed, REG_KEY,
                                  m_lastRunTimestamp);
        ASSERT_FALSE(writeResult.isErr());

      } else {
        mozilla::WindowsErrorResult<mozilla::Ok> deleteResult =
            RegistryDeleteValue(IsPrefixed::Prefixed, REG_KEY);
        ASSERT_FALSE(deleteResult.isErr());
      }
    }
  }

  ULONGLONG m_lastRunTimestamp;
  bool m_lastRunRegistryEntryExisted;
  bool m_lastRunRegisterEntryWasModified;
};

TEST_F(DefaultAgentTest, SecondsSinceLastRun) {
  // Now let's overwrite the value
  ULONGLONG now = GetCurrentTimestamp();
  mozilla::WindowsErrorResult<mozilla::Ok> writeResult =
      RegistrySetValueQword(IsPrefixed::Prefixed, REG_KEY, now);
  ASSERT_FALSE(writeResult.isErr());
  m_lastRunRegisterEntryWasModified = true;
  int64_t secondsSinceLastRun;
  nsresult result = getSecondsSinceLastAppRun(&secondsSinceLastRun);
  ASSERT_EQ(result, NS_OK);
  ASSERT_GE(secondsSinceLastRun, 0);  // should be a positive number
  ASSERT_LE(secondsSinceLastRun, 5);  // should be close to zero
}

TEST_F(DefaultAgentTest, AgentSecondsSinceLastRun) {
  int64_t secondsSinceLastRun;
  ULONGLONG now = GetCurrentTimestamp();
  mozilla::WindowsErrorResult<mozilla::Ok> writeResult =
      RegistrySetValueQword(IsPrefixed::Prefixed, REG_KEY, now);
  ASSERT_FALSE(writeResult.isErr());
  m_lastRunRegisterEntryWasModified = true;

  nsCOMPtr<nsIDefaultAgent> defaultAgent =
      do_CreateInstance(DEFAULT_AGENT_CONTRACT_ID);

  nsresult result = defaultAgent->SecondsSinceLastAppRun(&secondsSinceLastRun);
  ASSERT_EQ(result, NS_OK);
  ASSERT_GE(secondsSinceLastRun, 0);  // should be a positive number
  ASSERT_LE(secondsSinceLastRun, 5);  // should be close to zero
}

TEST_F(DefaultAgentTest, SendDefaultAgentPing) {
  DefaultBrowserInfo browserInfo = {Browser::InternetExplorer, Browser::Opera};
  DefaultPdfInfo pdfInfo = {PDFHandler::AdobeAcrobat};
  NotificationActivities activities = {NotificationType::Initial,
                                       NotificationShown::NotShown,
                                       NotificationAction::NoAction};
  uint32_t daysSinceAppLaunch = 12;
  std::string isTaskbarPinned = "NotPinned";
  InstallInfo installInfo = {false, "", "full", false, true};
  HRESULT result =
      SendDefaultAgentPing(browserInfo, pdfInfo, activities, daysSinceAppLaunch,
                           isTaskbarPinned, installInfo);
  ASSERT_EQ(S_OK, result);
}

TEST_F(DefaultAgentTest, SendPing) {
  nsCOMPtr<nsIDefaultAgent> defaultAgent =
      do_CreateInstance(DEFAULT_AGENT_CONTRACT_ID);

  auto currentBrowser = u"ie"_ns;
  auto previousBrowser = u"opera"_ns;
  auto pdfHandler = u"Adobe Acrobat"_ns;
  auto notificationShown = u"not-shown"_ns;
  auto notificationAction = u"no-action"_ns;
  uint32_t daysSinceLaunch = 12;

  auto isTaskbarPinned = u"NotPinned"_ns;
  auto winPackageFamilyName = u"Mozilla.Firefox_n80bbvh6b1yt2"_ns;
  auto installerType = u"msix"_ns;
  nsresult result = defaultAgent->SendPing(
      currentBrowser, previousBrowser, pdfHandler, notificationShown,
      notificationAction, daysSinceLaunch, isTaskbarPinned, true,
      winPackageFamilyName, installerType, false, false);
  ASSERT_EQ(result, NS_OK);
}

// Toggles the registry reflection of the telemetry opt-out pref and checks
// whether SendDefaultAgentPing submits the Glean ping.
class DefaultAgentPingTest : public ::testing::Test {
 protected:
  void SetUp() override {
    MaybeBoolResult readResult =
        RegistryGetValueBool(IsPrefixed::Prefixed, DISABLE_TELEMETRY_REG_NAME);
    ASSERT_TRUE(readResult.isOk());
    mSavedDisableTelemetry = readResult.unwrap();
  }

  void TearDown() override {
    if (mSavedDisableTelemetry.isSome()) {
      VoidResult writeResult =
          RegistrySetValueBool(IsPrefixed::Prefixed, DISABLE_TELEMETRY_REG_NAME,
                               mSavedDisableTelemetry.value());
      ASSERT_TRUE(writeResult.isOk());
    } else {
      (void)RegistryDeleteValue(IsPrefixed::Prefixed,
                                DISABLE_TELEMETRY_REG_NAME);
    }
  }

  bool PingSubmitted(bool aDisableTelemetry) {
    VoidResult writeResult = RegistrySetValueBool(
        IsPrefixed::Prefixed, DISABLE_TELEMETRY_REG_NAME, aDisableTelemetry);
    EXPECT_TRUE(writeResult.isOk());

    DefaultBrowserInfo browserInfo = {Browser::InternetExplorer,
                                      Browser::Opera};
    DefaultPdfInfo pdfInfo = {PDFHandler::AdobeAcrobat};
    NotificationActivities activities = {NotificationType::Initial,
                                         NotificationShown::NotShown,
                                         NotificationAction::NoAction};
    InstallInfo installInfo = {false, "", "full", true, false};
    return mozilla::glean_pings::DefaultAgent.TestSubmission(
        [](const nsACString& aReason) {},
        [&]() {
          HRESULT result = SendDefaultAgentPing(
              browserInfo, pdfInfo, activities, 12, "NotPinned", installInfo);
          EXPECT_EQ(S_OK, result);
        });
  }

  mozilla::Maybe<bool> mSavedDisableTelemetry;
};

TEST_F(DefaultAgentPingTest, SubmitsWhenTelemetryEnabled) {
  ASSERT_TRUE(PingSubmitted(false));
}

TEST_F(DefaultAgentPingTest, DoesNotSubmitWhenTelemetryDisabled) {
  ASSERT_FALSE(PingSubmitted(true));
}
