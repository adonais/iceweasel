#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import subprocess
from contextlib import nullcontext as does_not_raise
from unittest import mock

import pytest
from mozunit import main

from mozbuild.vendor.host_base import TagNotFound
from mozbuild.vendor.vendor_manifest import VendorManifest, _replace_in_file


@pytest.mark.parametrize(
    "pattern,replacement,input_data,expected,exception",
    [
        (
            "lookup.c",
            "vorbis_lookup.c",
            '#include "lookup.c"\n',
            '#include "vorbis_lookup.c"\n',
            does_not_raise(),
        ),
        (
            "lookup.c",
            "vorbis_lookup.c",
            '#include "vorbis_lookup.c"\n',
            '#include "vorbis_lookup.c"\n',
            pytest.raises(Exception),
        ),
        (
            "@VCS_TAG@",
            "616bfd1506a8a75c6a358e578cbec9ca11931502",
            '#define DAV1D_VERSION "@VCS_TAG@"\n',
            '#define DAV1D_VERSION "616bfd1506a8a75c6a358e578cbec9ca11931502"\n',
            does_not_raise(),
        ),
        (
            "@VCS_TAG@",
            "616bfd1506a8a75c6a358e578cbec9ca11931502",
            '#define DAV1D_VERSION "8a651f3a1f40fe73847423fb6a5776103cb42218"\n',
            '#define DAV1D_VERSION "616bfd1506a8a75c6a358e578cbec9ca11931502"\n',
            pytest.raises(Exception),
        ),
        (
            "[regexy pattern]",
            "replaced",
            "here\nis [regexy pattern]\n",
            "here\nis replaced\n",
            does_not_raise(),
        ),
        (
            "some (other) regex.",
            "replaced,",
            "This can be some (other) regex. Yo!\n",
            "This can be replaced, Yo!\n",
            does_not_raise(),
        ),
    ],
)
def test_replace_in_file(
    tmp_path, pattern, replacement, input_data, expected, exception
):
    file = tmp_path / "file.txt"
    file.write_text(input_data)

    with exception:
        _replace_in_file(file, pattern, replacement, regex=False)
        assert file.read_text() == expected


@pytest.mark.parametrize(
    "pattern,replacement,input_data,expected,exception",
    [
        (
            r"\[tag v[1-9\.]+\]",
            "[tag v1.2.13]",
            "Version:\n#[tag v1.2.12]\n",
            "Version:\n#[tag v1.2.13]\n",
            does_not_raise(),
        ),
        (
            r"\[tag v[1-9\.]+\]",
            "[tag v1.2.13]",
            "Version:\n#[tag v1.2.13]\n",
            "Version:\n#[tag v1.2.13]\n",
            does_not_raise(),
        ),
        (
            r"\[tag v[1-9\.]+\]",
            "[tag v0.17.0]",
            "Version:\n#[tag v0.16.3]\n",
            "Version:\n#[tag v0.17.0]\n",
            pytest.raises(Exception),
        ),
        (
            r"\[tag v[1-9\.]+\]",
            "[tag v0.17.0]",
            "Version:\n#[tag v0.16.3]\n",
            "Version:\n#[tag v0.17.0]\n",
            pytest.raises(Exception),
        ),
        (
            r'DEFINES\["OPUS_VERSION"\] = "(.+)"',
            'DEFINES["OPUS_VERSION"] = "5023249b5c935545fb02dbfe845cae996ecfc8bb"',
            'DEFINES["OPUS_BUILD"] = True\nDEFINES["OPUS_VERSION"] = "8a651f3a1f40fe73847423fb6a5776103cb42218"\nDEFINES["USE_ALLOCA"] = True\n',
            'DEFINES["OPUS_BUILD"] = True\nDEFINES["OPUS_VERSION"] = "5023249b5c935545fb02dbfe845cae996ecfc8bb"\nDEFINES["USE_ALLOCA"] = True\n',
            does_not_raise(),
        ),
        (
            r'DEFINES\["OPUS_VERSION"\] = "(.+)"',
            'DEFINES["OPUS_VERSION"] = "5023249b5c935545fb02dbfe845cae996ecfc8bb"',
            'DEFINES["OPUS_BUILD"] = True\nDEFINES["OPUS_TAG"] = "8a651f3a1f40fe73847423fb6a5776103cb42218"\nDEFINES["USE_ALLOCA"] = True\n',
            'DEFINES["OPUS_BUILD"] = True\nDEFINES["OPUS_VERSION"] = "5023249b5c935545fb02dbfe845cae996ecfc8bb"\nDEFINES["USE_ALLOCA"] = True\n',
            pytest.raises(Exception),
        ),
    ],
)
def test_replace_in_file_regex(
    tmp_path, pattern, replacement, input_data, expected, exception
):
    file = tmp_path / "file.txt"
    file.write_text(input_data)

    with exception:
        _replace_in_file(file, pattern, replacement, regex=True)
        assert file.read_text() == expected


def _fake_manifest():
    # import_local_patches only needs these four helpers, so build a bare
    # instance rather than a full MozbuildObject.
    vm = VendorManifest.__new__(VendorManifest)
    vm.logInfo = lambda *args, **kwargs: None
    vm.log = lambda *args, **kwargs: None
    vm.convert_patterns_to_paths = lambda directory, patterns: [
        os.path.join(directory, pattern) for pattern in patterns
    ]

    def run_process(args, log_name=None, ensure_exit_code=0):
        result = subprocess.run(args, capture_output=True, text=True, check=False)
        if result.returncode != ensure_exit_code:
            raise Exception(f"{args[0]} exited {result.returncode}: {result.stderr}")

    vm.run_process = run_process
    return vm


_PATCH = "--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,4 @@\n line1\n line2\n+added\n line3\n"
_ORIGINAL = "line1\nline2\nline3\n"
_PATCHED = "line1\nline2\nadded\nline3\n"


@pytest.mark.skipif(shutil.which("patch") is None, reason="requires patch(1)")
def test_import_local_patches_applies_cleanly(tmp_path):
    (tmp_path / "0.patch").write_text(_PATCH)
    (tmp_path / "f.txt").write_text(_ORIGINAL)

    _fake_manifest().import_local_patches(["0.patch"], str(tmp_path), str(tmp_path))

    assert (tmp_path / "f.txt").read_text() == _PATCHED


@pytest.mark.skipif(shutil.which("patch") is None, reason="requires patch(1)")
def test_import_local_patches_fails_on_already_applied(tmp_path):
    # Guards --forward: without it, `patch --batch` assumes -R and silently
    # un-applies an already-present change (exit 0), reverting upstreamed code.
    (tmp_path / "0.patch").write_text(_PATCH)
    (tmp_path / "f.txt").write_text(_PATCHED)

    with pytest.raises(Exception):
        _fake_manifest().import_local_patches(["0.patch"], str(tmp_path), str(tmp_path))

    assert (tmp_path / "f.txt").read_text() == _PATCHED


@pytest.mark.parametrize(
    "tracking,revision,tag_raises,expect_tag_lookup,expect_commit_lookup,exception",
    [
        # A normal tag resolves via the tag lookup; no commit fallback.
        ("tag", "v1.6.0", None, True, False, does_not_raise()),
        # A tag-tracking library pinned to a full commit hash: the tag lookup
        # fails, so we fall back to resolving it as a commit (bug 2056506).
        (
            "tag",
            "991170bbab3e6afc74666d124f3f1dc7be942cd0",
            TagNotFound("no such tag"),
            True,
            True,
            does_not_raise(),
        ),
        # An abbreviated (>= 7 hex) commit hash falls back too.
        ("tag", "991170b", TagNotFound("no such tag"), True, True, does_not_raise()),
        # A tag-tracking revision that is missing upstream and does NOT look like
        # a commit hash must re-raise, not be silently misread as a commit.
        (
            "tag",
            "release-2.1.13-stable",
            TagNotFound("no such tag"),
            True,
            False,
            pytest.raises(TagNotFound),
        ),
        # Commit tracking always resolves as a commit; the tag lookup is unused.
        (
            "commit",
            "991170bbab3e6afc74666d124f3f1dc7be942cd0",
            None,
            False,
            True,
            does_not_raise(),
        ),
    ],
)
def test_ref_resolution_commit_hash_fallback(
    tracking, revision, tag_raises, expect_tag_lookup, expect_commit_lookup, exception
):
    """mach vendor resolves the pinned revision correctly, including the
    tag-tracking-pinned-to-a-commit-hash fallback (bug 2056506)."""
    vm = VendorManifest.__new__(VendorManifest)
    vm.log = mock.Mock()

    source_host = mock.Mock()
    if tag_raises is not None:
        source_host.upstream_tag.side_effect = tag_raises
    else:
        source_host.upstream_tag.return_value = ("v1.6.0", "2025-07-11T00:00:00Z")
    source_host.upstream_commit.return_value = (revision, "2025-08-07T00:00:00Z")
    vm.get_source_host = mock.Mock(return_value=source_host)

    manifest = {
        "origin": {"name": "testlib", "revision": "in-tree-revision"},
        "vendoring": {
            "url": "https://example.com/testlib",
            "tracking": tracking,
            "vendor-directory": "third_party/testlib",
        },
    }

    with exception:
        # check_for_update=True makes vendor() return right after resolving the
        # revision, so only the resolution logic is exercised.
        vm.vendor(
            mock.Mock(),  # command_context
            "third_party/testlib/moz.yaml",  # yaml_file
            manifest,
            revision,
            False,  # ignore_modified
            True,  # check_for_update
            False,  # force
            False,  # add_to_exports
            "",  # patch_mode
            False,  # new_files_only
        )

    assert source_host.upstream_tag.called == expect_tag_lookup
    assert source_host.upstream_commit.called == expect_commit_lookup


@pytest.mark.parametrize(
    "initial_value",
    [
        "v1.3.0",  # plain unquoted tag (already worked before the fix)
        '"v1.3.0"',  # double-quoted value (bug 2056510)
        "'2df68f811fc1'",  # single-quoted hash
        "VER-2-14-1",  # tag not starting with v/./hex (was silently skipped)
        "release-2.1.13-stable",  # another non-hex-prefixed tag
        "0123456789abcdef",  # bare commit hash
    ],
)
def test_update_yaml_rewrites_quoted_and_unusual_values(tmp_path, initial_value):
    """update_yaml rewrites the release/revision lines even when the existing
    value is quoted or does not start with v/./hex (bug 2056510)."""
    moz_yaml = tmp_path / "moz.yaml"
    moz_yaml.write_text(
        "origin:\n"
        f"  release: {initial_value} (2023-01-01T00:00:00Z).\n"
        f"  revision: {initial_value}\n"
    )

    vm = VendorManifest.__new__(VendorManifest)
    vm.yaml_file = str(moz_yaml)
    vm.update_yaml("v9.9.9", "2026-01-01T00:00:00Z")

    result = moz_yaml.read_text()
    assert "  release: v9.9.9 (2026-01-01T00:00:00Z).\n" in result
    assert "  revision: v9.9.9\n" in result


@mock.patch("mozbuild.vendor.vendor_manifest.remove_file_from_moz_build_file")
@mock.patch("mozbuild.vendor.vendor_manifest.add_file_to_moz_build_file")
def test_update_moz_build_only_touches_tracked_file_types(add_file, remove_file):
    """Only file types that appear in moz.build source lists are added or
    removed. Anything else, a Rust source or a build script for instance, is
    not tracked in a moz.build file, so there is nothing to update and the
    vendor must not abort over it."""
    vm = VendorManifest.__new__(VendorManifest)
    vm.log = mock.Mock()
    vm.logInfo = mock.Mock()
    vm.repository = mock.Mock()

    changed = {
        "D": [
            "third_party/foo/components/fxa-client/build.rs",
            "third_party/foo/components/fxa-client/src/fxa_client.udl",
            "third_party/foo/src/gone.cpp",
            "third_party/foo/src/gone.h",
        ],
        "A": [
            "third_party/foo/src/new.rs",
            "third_party/foo/uniffi.toml",
            "third_party/foo/src/new.c",
        ],
    }
    vm.repository.get_changed_files.side_effect = lambda diff_filter: changed[
        diff_filter
    ]

    vm.update_moz_build("third_party/foo", "third_party/foo", False)

    assert [call.args[0] for call in add_file.call_args_list] == [
        "third_party/foo/src/new.c"
    ]
    assert [call.args[0] for call in remove_file.call_args_list] == [
        "third_party/foo/src/gone.cpp",
        "third_party/foo/src/gone.h",
    ]


def test_update_yaml_asserts_when_a_field_is_missing(tmp_path):
    """update_yaml fails loudly (rather than silently leaving a stale field) if
    a release/revision line it expects to rewrite is absent (bug 2056510)."""
    moz_yaml = tmp_path / "moz.yaml"
    moz_yaml.write_text("origin:\n  revision: v1.3.0\n")  # no release line

    vm = VendorManifest.__new__(VendorManifest)
    vm.yaml_file = str(moz_yaml)
    with pytest.raises(AssertionError):
        vm.update_yaml("v9.9.9", "2026-01-01T00:00:00Z")


if __name__ == "__main__":
    main()
