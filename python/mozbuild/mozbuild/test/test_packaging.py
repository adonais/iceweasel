# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import mozunit

from mozbuild.packaging import (
    NO_PKG_FILES,
    jsshell_name,
    langpack_basename,
    no_pkg_files,
    package_basename,
    quote_defines,
)


def test_no_pkg_files_with_manifest():
    files = no_pkg_files(has_manifest=True, dmd=False)
    assert files == NO_PKG_FILES
    assert "ssltunnel*" not in files
    assert "SmokeDMD" not in files


def test_no_pkg_files_without_manifest_excludes_ssltunnel():
    files = no_pkg_files(has_manifest=False, dmd=False)
    assert files[: len(NO_PKG_FILES)] == NO_PKG_FILES
    assert files[len(NO_PKG_FILES) :] == ("ssltunnel*",)


def test_no_pkg_files_with_dmd():
    files = no_pkg_files(has_manifest=True, dmd=True)
    assert files[len(NO_PKG_FILES) :] == ("SmokeDMD",)


def test_no_pkg_files_both():
    files = no_pkg_files(has_manifest=False, dmd=True)
    assert files[len(NO_PKG_FILES) :] == ("ssltunnel*", "SmokeDMD")


def test_no_pkg_files_does_not_mutate_the_shared_tuple():
    no_pkg_files(has_manifest=False, dmd=True)
    assert "ssltunnel*" not in NO_PKG_FILES
    assert "SmokeDMD" not in NO_PKG_FILES


def test_quote_defines_preserves_order():
    assert quote_defines(["-DA=1", "-DB=2"]) == "-DA=1 -DB=2"


def test_quote_defines_leaves_plain_values_unquoted():
    assert quote_defines(["-DMOZ_APP_NAME=firefox"]) == "-DMOZ_APP_NAME=firefox"


def test_quote_defines_keeps_values_with_spaces_as_one_argument():
    import shlex

    quoted = quote_defines(["-DMOZ_APP_DISPLAYNAME=Firefox Nightly"])
    assert shlex.split(quoted) == ["-DMOZ_APP_DISPLAYNAME=Firefox Nightly"]


def test_quote_defines_empty_value():
    assert quote_defines(["-DJAREXT="]) == "-DJAREXT="


def test_quote_defines_empty_list():
    assert quote_defines([]) == ""


def test_package_basename():
    assert (
        package_basename(
            appname="firefox", version="145.0a1", ab_cd="en-US", platform="linux-x86_64"
        )
        == "firefox-145.0a1.en-US.linux-x86_64"
    )


def test_package_basename_locale():
    assert (
        package_basename(
            appname="firefox", version="145.0a1", ab_cd="de", platform="win64"
        )
        == "firefox-145.0a1.de.win64"
    )


def test_package_basename_simple_name_wins():
    assert (
        package_basename(
            appname="firefox",
            version="145.0a1",
            ab_cd="en-US",
            platform="win64",
            simple_name="target",
        )
        == "target"
    )


def test_langpack_basename():
    assert (
        langpack_basename(appname="firefox", version="145.0a1", ab_cd="de")
        == "firefox-145.0a1.de.langpack"
    )


def test_langpack_basename_simple_name():
    assert (
        langpack_basename(
            appname="firefox", version="145.0a1", ab_cd="de", simple_name="target"
        )
        == "target.langpack"
    )


def test_jsshell_name():
    assert jsshell_name(platform="linux-x86_64") == "jsshell-linux-x86_64.zip"


def test_jsshell_name_simple_name():
    assert jsshell_name(platform="win64", simple_name="target") == "target.jsshell.zip"


if __name__ == "__main__":
    mozunit.main()
