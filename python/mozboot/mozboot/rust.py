# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import platform as platform_mod
import sys

from mozboot.util import is_win_aarch64_host

# Base url for pulling the rustup installer.
RUSTUP_URL_BASE = "https://static.rust-lang.org/rustup"

# Pull this to get the lastest stable version number.
RUSTUP_MANIFEST = RUSTUP_URL_BASE + "/release-stable.toml"

# We bake in a known version number so we can verify a checksum.
RUSTUP_VERSION = "1.29.0"

# SHA-256 checksums of the installers, per platform.
RUSTUP_HASHES = {
    "x86_64-unknown-freebsd": "c3fdfa4553e088edad701ea74776eb707644bed9f4a44f42a077e733201e966a",
    "aarch64-apple-darwin": "aeb4105778ca1bd3c6b0e75768f581c656633cd51368fa61289b6a71696ac7e1",
    "x86_64-apple-darwin": "33cf85df9142bc6d29cbc62fa5ca1d4c29622cddb55213a4c1a43c457fb9b2d7",
    "x86_64-unknown-linux-gnu": "4acc9acc76d5079515b46346a485974457b5a79893cfb01112423c89aeb5aa10",
    "aarch64-unknown-linux-gnu": "9732d6c5e2a098d3521fca8145d826ae0aaa067ef2385ead08e6feac88fa5792",
    "x86_64-pc-windows-msvc": "86478e53f769379d7f0ebfa7c9aa97cb76ca92233f79aa2cc0dbee2efaac73c7",
    "aarch64-pc-windows-msvc": "3af309e6c3062aa11df0e932954f69d13b734d8a431e593812f3ecd9ff9e6ef6",
    "x86_64-unknown-netbsd": "0f513ad0d0dd4e6f650183793b47f1a59f69a89862f18b59c42503d08828ed90",
}

NO_PLATFORM = """
Sorry, we have no installer configured for your platform.

Please try installing rust for your system from https://rustup.rs/
or from https://rust-lang.org/ or from your package manager.
"""


def rustup_url(host, version=RUSTUP_VERSION):
    """Download url for a particular version of the installer."""
    return "%(base)s/archive/%(version)s/%(host)s/rustup-init%(ext)s" % {
        "base": RUSTUP_URL_BASE,
        "version": version,
        "host": host,
        "ext": exe_suffix(host),
    }


def rustup_hash(host):
    """Look up the checksum for the given installer."""
    return RUSTUP_HASHES.get(host, None)


def platform():
    """Determine the appropriate rust platform string for the current host"""
    if sys.platform.startswith("darwin"):
        if platform_mod.machine() == "arm64":
            return "aarch64-apple-darwin"
        return "x86_64-apple-darwin"
    elif sys.platform.startswith(("win32", "msys")):
        if is_win_aarch64_host():
            return "aarch64-pc-windows-msvc"
        # Bravely assume we'll be building 64-bit Firefox.
        return "x86_64-pc-windows-msvc"
    elif sys.platform.startswith("linux"):
        if platform_mod.machine() == "aarch64":
            return "aarch64-unknown-linux-gnu"
        return "x86_64-unknown-linux-gnu"
    elif sys.platform.startswith("freebsd"):
        return "x86_64-unknown-freebsd"
    elif sys.platform.startswith("netbsd"):
        return "x86_64-unknown-netbsd"

    return None


def exe_suffix(host=None):
    if not host:
        host = platform()
    if "windows" in host:
        return ".exe"
    return ""


USAGE = """
python rust.py [--update]

Pass the --update option print info for the latest release of rustup-init.

When invoked without the --update option, it queries the latest version
and verifies the current stored checksums against the distribution server,
but doesn't update the version installed by `mach bootstrap`.
"""


def unquote(s):
    """Strip outer quotation marks from a string."""
    return s.strip("'").strip('"')


def rustup_latest_version():
    """Query the latest version of the rustup installer."""
    import requests

    r = requests.get(RUSTUP_MANIFEST)
    # The manifest is toml, but we might not have the toml4 python module
    # available, so use ad-hoc parsing to obtain the current release version.
    #
    # The manifest looks like:
    #
    # schema-version = '1'
    # version = '0.6.5'
    #
    for line in r.iter_lines():
        line = line.decode("utf-8")
        key, value = map(str.strip, line.split("=", 2))
        if key == "schema-version":
            schema = int(unquote(value))
            if schema != 1:
                print("ERROR: Unknown manifest schema %s" % value)
                sys.exit(1)
        elif key == "version":
            return unquote(value)
    return None


def http_download_and_hash(url):
    import hashlib

    import requests

    h = hashlib.sha256()
    r = requests.get(url, stream=True)
    for data in r.iter_content(4096):
        h.update(data)
    return h.hexdigest()


def make_checksums(version, validate=False):
    hashes = []
    for platform in RUSTUP_HASHES.keys():
        if validate:
            print("Checking %s... " % platform, end="", flush=True)
        else:
            print("Fetching %s... " % platform, end="", flush=True)
        checksum = http_download_and_hash(rustup_url(platform, version))
        if validate and checksum != rustup_hash(platform):
            print(
                "mismatch:\n  script: %s\n  server: %s"
                % (RUSTUP_HASHES[platform], checksum)
            )
        else:
            print("OK")
        hashes.append((platform, checksum))
    return hashes


if __name__ == "__main__":
    """Allow invoking the module as a utility to update checksums."""

    update = False
    if len(sys.argv) > 1:
        if sys.argv[1] == "--update":
            update = True
        else:
            print(USAGE)
            sys.exit(1)

    print("Checking latest installer version... ", end="", flush=True)
    version = rustup_latest_version()
    if not version:
        print("ERROR: Could not query current rustup installer version.")
        sys.exit(1)
    print(version)

    if version == RUSTUP_VERSION:
        print("We're up to date. Validating checksums.")
        make_checksums(version, validate=True)
        sys.exit()

    if not update:
        print("Out of date. We use %s. Validating checksums." % RUSTUP_VERSION)
        make_checksums(RUSTUP_VERSION, validate=True)
        sys.exit()

    print("Out of date. We use %s. Calculating checksums." % RUSTUP_VERSION)
    hashes = make_checksums(version)
    print("")
    print("RUSTUP_VERSION = '%s'" % version)
    print("RUSTUP_HASHES = {")
    for item in hashes:
        print("    '%s':\n        '%s'," % item)
    print("}")
