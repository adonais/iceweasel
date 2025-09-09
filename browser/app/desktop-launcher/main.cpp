/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include <iostream>
#include <optional>
#include <rpc.h>
#include <shellapi.h>
#include <string>
#include <windows.h>
#include "download_firefox.h"
#include "file_sink.h"
#include "find_firefox.h"
#include "tempfile_name.h"

#define DOWNLOAD_PAGE L"https://www.mozilla.org/firefox/new/"

int wmain() {
  // For telemetry purposes, let's set the env variable to indicate that
  // we used the launcher to start Firefox
  if (!SetEnvironmentVariableW(L"FIREFOX_LAUNCHED_BY_DESKTOP_LAUNCHER",
                               L"TRUE")) {
    std::wcout
        << L"Could not set env variable FIREFOX_LAUNCHED_BY_DESKTOP_LAUNCHER"
        << std::endl;
  }

  // First, we try to launch Firefox if it is installed
  std::optional<std::wstring> firefox_path = lookupFirefoxPath();
  if (firefox_path.has_value()) {
    std::wcout << L"Found Firefox at path " << firefox_path.value()
               << std::endl;
    HINSTANCE hinst =
        ShellExecuteW(nullptr, nullptr, firefox_path.value().c_str(), nullptr,
                      nullptr, SW_SHOWNORMAL);
    if ((INT_PTR)hinst > 32) {
      // ShellExecuteW returns a value > 32 on success. So we assume that
      // Firefox has launched.
      std::wcout << L"Firefox launched" << std::endl;
      return 0;
    }
  }
  bool download_completed = false;
  // If that doesn't work, we try to download the installer.
  std::optional<std::wstring> tempfileName = get_tempfile_name();
  if (tempfileName.has_value()) {
    std::unique_ptr<FileSink> fileSink = std::make_unique<FileSink>();
    if (fileSink->open(tempfileName.value())) {
      ErrCode rc = download_firefox(fileSink.get());
      if (rc == ErrCode::OK) {
        std::wcout << L"Firefox installer successfully downloaded" << std::endl;
        download_completed = true;
      }
    }
  }
  // If the installer successfully downloaded, try to launch it
  if (download_completed) {
    HINSTANCE hinst =
        ShellExecuteW(nullptr, nullptr, tempfileName.value().c_str(),
                      L"/Prompt", nullptr, SW_SHOWNORMAL);
    if ((INT_PTR)hinst > 32) {
      // ShellExecuteW returns a value > 32 on success.
      std::wcout << L"Firefox installer launched" << std::endl;
      return 0;
    }
  }
  // If that doesn't work, open the download page in the default browser
  HINSTANCE default_browser_hinst = ShellExecuteW(
      nullptr, nullptr, DOWNLOAD_PAGE, nullptr, nullptr, SW_SHOWNORMAL);
  if ((INT_PTR)default_browser_hinst > 32) {
    // ShellExecuteW returns a value > 32 on success.
    std::wcout << L"Opened default browser to the download page" << std::endl;
  }
  return 0;
}
