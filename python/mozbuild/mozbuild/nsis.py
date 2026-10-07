# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Static file manifests used to stage Windows NSIS installers."""

from __future__ import annotations

_INSTALLER_BASE_FILES = (
    "app.tag",
    "nsis/content/installing.html",
    "nsis/content/installing.js",
    "nsis/content/profile_cleanup.html",
    "nsis/content/profile_cleanup.js",
    "nsis/content/stub_common.css",
    "nsis/content/stub_common.js",
    "nsis/installer.nsi",
    "nsis/install_dir_helpers.nsh",
    "nsis/installer_helpers.nsh",
    "nsis/uninstaller.nsi",
    "nsis/uninstaller_helpers.nsh",
    "nsis/stub.nsi",
    "nsis/stub.nsh",
    "nsis/stub_helpers.nsh",
    "nsis/stub_shared_defs.nsh",
    "nsis/shared.nsh",
    "nsis/control_utils.nsh",
    "nsis/postupdate_helper.nsh",
    "nsis/telemetry.nsh",
    "nsis/test_stub.nsi",
    "nsis/test_telemetry.nsh",
    "nsis/desktop_launcher_helpers.nsh",
    "stub.tag",
)

NSIS_BRANDING_FILES = (
    "branding.nsi",
    "firefox64.ico",
    "stubinstaller/bgstub.jpg",
    "stubinstaller/installing_page.css",
    "stubinstaller/profile_cleanup_page.css",
    "wizHeader.bmp",
    "wizHeaderRTL.bmp",
    "wizWatermark.bmp",
)

NSIS_TOOLKIT_FILES = (
    "common.nsh",
    "locale.nlf",
    "locale-fonts.nsh",
    "locale-rtl.nlf",
    "locales.nsi",
    "overrides.nsh",
    "setup.ico",
)

NSIS_CUSTOM_PLUGINS = (
    "AccessControl.dll",
    "AppAssocReg.dll",
    "ApplicationID.dll",
    "BitsUtils.dll",
    "CertCheck.dll",
    "CityHash.dll",
    "ExecInExplorer.dll",
    "HttpPostFile.dll",
    "InetBgDL.dll",
    "InvokeShellVerb.dll",
    "liteFirewallW.dll",
    "nsJSON.dll",
    "PinToTaskbar.dll",
    "ServicesHelper.dll",
    "ShellLink.dll",
    "UAC.dll",
    "WebBrowser.dll",
)

NSIS_CUSTOM_UI = ("nsisui.exe",)


def installer_files(*, maintenance_service: bool) -> tuple[str, ...]:
    if maintenance_service:
        return _INSTALLER_BASE_FILES + ("nsis/maintenanceservice_installer.nsi",)
    return _INSTALLER_BASE_FILES
