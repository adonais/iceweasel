/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Telemetry.h"

#include <string>

#include <windows.h>

#include "common.h"
#include "EventLog.h"
#include "Notification.h"
#include "Policy.h"
#include "Registry.h"

#include "mozilla/glean/ToolkitMozappsDefaultagentMetrics.h"
#include "mozilla/glean/GleanPings.h"
#include "mozilla/WinHeaderOnlyUtils.h"
#include "nsStringFwd.h"

// We only want to send one ping per day. However, this is slightly less than 24
// hours so that we have a little bit of wiggle room on our task, which is also
// supposed to run every 24 hours.
#define MINIMUM_PING_PERIOD_SEC ((23 * 60 * 60) + (45 * 60))

#define PREV_NOTIFICATION_ACTION_REG_NAME L"PrevNotificationAction"

#if !defined(RRF_SUBKEY_WOW6464KEY)
#  define RRF_SUBKEY_WOW6464KEY 0x00010000
#endif  // !defined(RRF_SUBKEY_WOW6464KEY)

namespace mozilla::default_agent {

using TelemetryFieldResult = mozilla::WindowsErrorResult<std::string>;
using BoolResult = mozilla::WindowsErrorResult<bool>;

static TelemetryFieldResult GetOSVersion() {
  OSVERSIONINFOEXW osv = {sizeof(osv)};
  if (::GetVersionExW(reinterpret_cast<OSVERSIONINFOW*>(&osv))) {
    std::ostringstream oss;
    oss << osv.dwMajorVersion << "." << osv.dwMinorVersion << "."
        << osv.dwBuildNumber;

    if (osv.dwMajorVersion == 10 && osv.dwMinorVersion == 0) {
      // Get the "Update Build Revision" (UBR) value
      DWORD ubrValue;
      DWORD ubrValueLen = sizeof(ubrValue);
      LSTATUS ubrOk =
          ::RegGetValueW(HKEY_LOCAL_MACHINE,
                         L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
                         L"UBR", RRF_RT_DWORD | RRF_SUBKEY_WOW6464KEY, nullptr,
                         &ubrValue, &ubrValueLen);
      if (ubrOk == ERROR_SUCCESS) {
        oss << "." << ubrValue;
      }
    }

    return oss.str();
  }

  HRESULT hr = HRESULT_FROM_WIN32(GetLastError());
  LOG_ERROR(hr);
  return TelemetryFieldResult(mozilla::WindowsError::FromHResult(hr));
}

// This function checks if a ping has already been sent today. If one has not,
// it assumes that we are about to send one and sets a registry entry that will
// cause this function to return true for the next day.
// This function uses unprefixed registry entries, so a RegistryMutex should be
// held before calling.
static BoolResult GetPingAlreadySentToday() {
  const wchar_t* valueName = L"LastPingSentAt";
  MaybeQwordResult readResult =
      RegistryGetValueQword(IsPrefixed::Unprefixed, valueName);
  if (readResult.isErr()) {
    HRESULT hr = readResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to read registry: %#X", hr);
    return BoolResult(mozilla::WindowsError::FromHResult(hr));
  }
  mozilla::Maybe<ULONGLONG> maybeValue = readResult.unwrap();
  ULONGLONG now = GetCurrentTimestamp();
  if (maybeValue.isSome()) {
    ULONGLONG lastPingTime = maybeValue.value();
    if (SecondsPassedSince(lastPingTime, now) < MINIMUM_PING_PERIOD_SEC) {
      return true;
    }
  }

  mozilla::WindowsErrorResult<mozilla::Ok> writeResult =
      RegistrySetValueQword(IsPrefixed::Unprefixed, valueName, now);
  if (writeResult.isErr()) {
    HRESULT hr = readResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to write registry: %#X", hr);
    return BoolResult(mozilla::WindowsError::FromHResult(hr));
  }
  return false;
}

// This both retrieves a value from the registry and writes new data
// (`currentOSVersion`) to the same value. If there is no value stored,
// `currentOSVersion` is returned instead.
//
// The value we retrieve here will only be updated when we are sending a ping to
// ensure that pings don't miss a Windows OS version transition.
static TelemetryFieldResult GetAndUpdatePreviousOSVersion(
    const std::string& currentOSVersion) {
  const wchar_t* registryValueName = L"PingCurrentOSVersion";

  MaybeStringResult readResult =
      RegistryGetValueString(IsPrefixed::Unprefixed, registryValueName);
  if (readResult.isErr()) {
    HRESULT hr = readResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to read registry: %#X", hr);
    return TelemetryFieldResult(mozilla::WindowsError::FromHResult(hr));
  }
  mozilla::Maybe<std::string> maybeValue = readResult.unwrap();
  std::string oldOSVersion = maybeValue.valueOr(currentOSVersion);

  mozilla::WindowsErrorResult<mozilla::Ok> writeResult = RegistrySetValueString(
      IsPrefixed::Unprefixed, registryValueName, currentOSVersion.c_str());
  if (writeResult.isErr()) {
    HRESULT hr = writeResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to write registry: %#X", hr);
    return TelemetryFieldResult(mozilla::WindowsError::FromHResult(hr));
  }
  return oldOSVersion;
}

// This both retrieves a value from the registry and writes new data
// (`currentIsPinned`) to the same value. If there is no value stored,
// `currentIsPinned` is returned instead.
//
// The value we retrieve here will only be updated when we are sending a ping to
// ensure that pings don't miss a pin state transition.
static TelemetryFieldResult GetAndUpdatePreviousIsPinned(
    const std::string& currentIsPinned) {
  const wchar_t* registryValueName = L"PingCurrentIsPinned";

  MaybeStringResult readResult =
      RegistryGetValueString(IsPrefixed::Unprefixed, registryValueName);
  if (readResult.isErr()) {
    HRESULT hr = readResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to read registry: %#X", hr);
    return TelemetryFieldResult(mozilla::WindowsError::FromHResult(hr));
  }
  mozilla::Maybe<std::string> maybeValue = readResult.unwrap();
  std::string oldIsPinned = maybeValue.valueOr(currentIsPinned);

  mozilla::WindowsErrorResult<mozilla::Ok> writeResult = RegistrySetValueString(
      IsPrefixed::Unprefixed, registryValueName, currentIsPinned.c_str());
  if (writeResult.isErr()) {
    HRESULT hr = writeResult.unwrapErr().AsHResult();
    LOG_ERROR_MESSAGE(L"Unable to write registry: %#X", hr);
    return TelemetryFieldResult(mozilla::WindowsError::FromHResult(hr));
  }
  return oldIsPinned;
}

HRESULT SendDefaultAgentPing(const DefaultBrowserInfo& browserInfo,
                             const DefaultPdfInfo& pdfInfo,
                             const NotificationActivities& activitiesPerformed,
                             uint32_t daysSinceLastAppLaunch,
                             const std::string& isTaskbarPinned,
                             const InstallInfo& installInfo) {
  std::string currentDefaultBrowser =
      GetStringForBrowser(browserInfo.currentDefaultBrowser);
  std::string currentDefaultPdf =
      GetStringForPDFHandler(pdfInfo.currentDefaultPdf);
  std::string notificationType =
      GetStringForNotificationType(activitiesPerformed.type);
  std::string notificationShown =
      GetStringForNotificationShown(activitiesPerformed.shown);
  std::string notificationAction =
      GetStringForNotificationAction(activitiesPerformed.action);

  std::string osVersion =
      GetOSVersion()
          .orElse([](auto e) -> TelemetryFieldResult {
            HRESULT hr = e.AsHResult();
            LOG_ERROR_MESSAGE(L"Unable to retrieve OS version: %#X", hr);
            return std::string("Error");
          })
          .unwrap();

  // Do not send the ping if telemetry has been disabled by policy.
  if (IsTelemetryDisabled()) {
    return S_OK;
  }

  // Glean notification pings are handled asynchronously from system defaults
  // pings; they need not adhere to the system default ping's 24 hour cadence.
  if (activitiesPerformed.shown != NotificationShown::NotShown) {
    mozilla::glean::notification::show_success.Set(activitiesPerformed.shown ==
                                                   NotificationShown::Shown);
    if (activitiesPerformed.shown == NotificationShown::Shown) {
      mozilla::glean::notification::action.Set(
          nsDependentCString(notificationAction.c_str()));
    }
  }

  // Pings are limited to one per day (across all installations), so check if we
  // already sent one today. This also prevents system-level Glean metrics from
  // being set multiple times per day when multiple Firefox installations run
  // the scheduled task.
  BoolResult pingAlreadySentResult = GetPingAlreadySentToday();
  if (pingAlreadySentResult.isErr()) {
    return pingAlreadySentResult.unwrapErr().AsHResult();
  }
  bool pingAlreadySent = pingAlreadySentResult.unwrap();

  if (!pingAlreadySent) {
    std::string prevOSVersion =
        GetAndUpdatePreviousOSVersion(osVersion)
            .orElse([](auto e) -> TelemetryFieldResult {
              HRESULT hr = e.AsHResult();
              LOG_ERROR_MESSAGE(L"Unable to read previous OS version: %#X", hr);
              return std::string("Error");
            })
            .unwrap();

    mozilla::glean::system::os_version.Set(
        nsDependentCString(osVersion.c_str()));
    mozilla::glean::system::previous_os_version.Set(
        nsDependentCString(prevOSVersion.c_str()));
    mozilla::glean::system_default::browser.Set(
        nsDependentCString(currentDefaultBrowser.c_str()));
    std::string previousDefaultBrowser =
        GetStringForBrowser(browserInfo.previousDefaultBrowser);
    mozilla::glean::system_default::previous_browser.Set(
        nsDependentCString(previousDefaultBrowser.c_str()));
    mozilla::glean::system_default::pdf_handler.Set(
        nsDependentCString(currentDefaultPdf.c_str()));
    mozilla::glean::defaultagent::days_since_last_app_launch.Set(
        daysSinceLastAppLaunch);

    std::string prevIsTaskbarPinned =
        GetAndUpdatePreviousIsPinned(isTaskbarPinned)
            .orElse([](auto e) -> TelemetryFieldResult {
              HRESULT hr = e.AsHResult();
              LOG_ERROR_MESSAGE(L"Unable to read previous pin state: %#X", hr);
              return std::string("Error");
            })
            .unwrap();

    mozilla::glean::system_pin::is_taskbar_pinned.Set(
        nsDependentCString(isTaskbarPinned.c_str()));
    mozilla::glean::system_pin::previous_is_taskbar_pinned.Set(
        nsDependentCString(prevIsTaskbarPinned.c_str()));

    mozilla::glean::install::has_win_package_id.Set(
        installInfo.hasWinPackageId);
    if (!installInfo.winPackageFamilyName.empty()) {
      mozilla::glean::install::win_package_family_name.Set(
          nsDependentCString(installInfo.winPackageFamilyName.c_str()));
    }
    if (!installInfo.installerType.empty()) {
      mozilla::glean::install::installer_type.Set(
          nsDependentCString(installInfo.installerType.c_str()));
    }
    if (installInfo.installerType == "full") {
      mozilla::glean::install::from_msi.Set(installInfo.fromMsi);
      mozilla::glean::install::silent.Set(installInfo.silent);
    }
  }

  mozilla::glean_pings::DefaultAgent.Submit("daily_ping"_ns);

  return S_OK;
}

}  // namespace mozilla::default_agent
