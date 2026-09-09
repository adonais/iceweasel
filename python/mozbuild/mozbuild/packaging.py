# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Helpers shared by configure and packaging."""

import shlex
from typing import Iterable, Optional

NO_PKG_FILES = (
    "core",
    "bsdecho",
    "js",
    "js-config",
    "jscpucfg",
    "nsinstall",
    "viewer",
    "TestGtkEmbed",
    "elf-dynstr-gc",
    "mangle*",
    "maptsv*",
    "mfc*",
    "msdump*",
    "msmap*",
    "nm2tsv*",
    "nsinstall*",
    "res/samples",
    "res/throbber",
    "shlibsign*",
    "certutil*",
    "pk12util*",
    "BadCertAndPinningServer*",
    "DelegatedCredentialsServer*",
    "EncryptedClientHelloServer*",
    "FaultyServer*",
    "OCSPStaplingServer*",
    "SanctionsTestServer*",
    "GenerateOCSPResponse*",
    "chrome/chrome.rdf",
    "chrome/app-chrome.manifest",
    "chrome/overlayinfo",
    "components/compreg.dat",
    "components/xpti.dat",
    "content_unit_tests",
    "necko_unit_tests",
    "*.dSYM",
)


def no_pkg_files(*, has_manifest: bool, dmd: bool) -> tuple:
    files = NO_PKG_FILES
    if not has_manifest:
        files += ("ssltunnel*",)
    if dmd:
        files += ("SmokeDMD",)
    return files


def quote_defines(defines: Iterable[str]) -> str:
    return " ".join(shlex.quote(d) for d in defines)


def package_basename(
    *,
    appname: str,
    version: str,
    ab_cd: str,
    platform: str,
    simple_name: Optional[str] = None,
) -> str:
    if simple_name:
        return simple_name
    return f"{appname}-{version}.{ab_cd}.{platform}"


def langpack_basename(
    *,
    appname: str,
    version: str,
    ab_cd: str,
    simple_name: Optional[str] = None,
) -> str:
    if simple_name:
        return f"{simple_name}.langpack"
    return f"{appname}-{version}.{ab_cd}.langpack"


def jsshell_name(*, platform: str, simple_name: Optional[str] = None) -> str:
    if simple_name:
        return f"{simple_name}.jsshell.zip"
    return f"jsshell-{platform}.zip"
