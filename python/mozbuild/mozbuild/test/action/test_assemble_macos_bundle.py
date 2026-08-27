# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import unittest
from tempfile import mkdtemp
from unittest import mock

import mozunit
from mozfile import json

from mozbuild.action import assemble_macos_bundle
from mozbuild.action.assemble_macos_bundle import main

RSYNC = shutil.which("rsync")


class TestAssembleMacOSBundle(unittest.TestCase):
    def setUp(self):
        self.tmpdir = mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir)

    def _write(self, path, content=""):
        full = os.path.join(self.tmpdir, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(content)
        return full

    def _spec(self, **overrides):
        spec = {
            "bundle": os.path.join(self.tmpdir, "Firefox.app"),
            "skeleton": None,
            "info_plist": None,
            "strings": None,
            "lproj": "English.lproj",
            "binaries": [],
            "extra_files": [],
            "stage": None,
            "macos_files": None,
            "macos_copy_files": None,
            "moves": [],
            "pkginfo": None,
            "copies": [],
        }
        spec.update(overrides)
        return spec

    def _commands(self, spec):
        spec_path = self._write("spec.json", json.dumps(spec))
        calls = []
        with mock.patch.object(
            assemble_macos_bundle.subprocess,
            "run",
            side_effect=lambda cmd, **kw: calls.append(cmd),
        ):
            self.assertEqual(main([spec_path]), 0)
        return calls

    def test_staged_bundle_commands(self):
        stage = os.path.join(self.tmpdir, "bin")
        os.makedirs(stage)
        macos_files = self._write("MacOS-files.txt", "XUL\n")
        macos_copy = self._write("MacOS-files-copy.in", "*.dylib\n")
        spec = self._spec(
            stage=stage,
            macos_files=macos_files,
            macos_copy_files=macos_copy,
            binaries=[[os.path.join(stage, "firefox"), "firefox"]],
        )
        calls = self._commands(spec)

        # Staging splits dist/bin between Resources and MacOS, then deep-copies
        # the entries that must not stay symlinks.
        self.assertTrue(
            any("--exclude-from" in c and c[-1].endswith("Resources/") for c in calls)
        )
        self.assertTrue(any("--include-from" in c and "-L" not in c for c in calls))
        self.assertTrue(any("--include-from" in c and "-L" in c for c in calls))
        # Binaries are installed following symlinks.
        self.assertTrue(
            any(
                c[-1].endswith(os.path.join("MacOS", "firefox")) and "-L" in c
                for c in calls
            )
        )

    def test_staged_bundle_is_rebuilt(self):
        stage = os.path.join(self.tmpdir, "bin")
        os.makedirs(stage)
        stale = os.path.join(self.tmpdir, "Firefox.app", "Contents", "stale")
        os.makedirs(os.path.dirname(stale))
        open(stale, "w").close()
        spec = self._spec(
            stage=stage,
            macos_files=self._write("m.txt", ""),
            macos_copy_files=self._write("c.in", ""),
        )
        self._commands(spec)
        self.assertFalse(os.path.exists(stale))

    def test_unstaged_bundle_synced_in_place(self):
        bundle = os.path.join(self.tmpdir, "helper.app")
        marker = os.path.join(bundle, "Contents", "keep")
        os.makedirs(os.path.dirname(marker))
        open(marker, "w").close()
        self._commands(self._spec(bundle=bundle))
        self.assertTrue(os.path.exists(marker))

    def test_copies_command_uses_delete(self):
        copy_dest = os.path.join(self.tmpdir, "Copy.app")
        calls = self._commands(self._spec(copies=[copy_dest]))
        self.assertTrue(
            any("--delete" in c and c[-1].endswith("Copy.app/") for c in calls)
        )

    @unittest.skipUnless(RSYNC, "rsync is required")
    def test_assemble_bundle(self):
        skeleton = os.path.join(self.tmpdir, "skeleton")
        self._write("skeleton/PkgInfo.in", "ignored")
        self._write("skeleton/Resources/ChannelPrefs.framework/data", "fw")
        info_plist = self._write("Info.plist", "plist")
        strings = self._write("InfoPlist.strings", "strings")
        binary = self._write("bin/firefox", "exe")
        icon = self._write("branding/firefox.icns", "icns")
        bundle = os.path.join(self.tmpdir, "Firefox.app")
        spec = self._spec(
            bundle=bundle,
            skeleton=skeleton,
            info_plist=info_plist,
            strings=strings,
            lproj="en.lproj",
            binaries=[[binary, "firefox"]],
            extra_files=[[icon, "Resources/firefox.icns"]],
            moves=[("ChannelPrefs.framework", "Frameworks/ChannelPrefs.framework")],
            pkginfo="APPLMOZB",
        )
        spec_path = self._write("spec.json", json.dumps(spec))
        self.assertEqual(main([spec_path]), 0)

        contents = os.path.join(bundle, "Contents")
        self.assertTrue(os.path.exists(os.path.join(contents, "Info.plist")))
        self.assertTrue(
            os.path.exists(
                os.path.join(contents, "Resources", "en.lproj", "InfoPlist.strings")
            )
        )
        self.assertTrue(os.path.exists(os.path.join(contents, "MacOS", "firefox")))
        self.assertTrue(
            os.path.exists(os.path.join(contents, "Resources", "firefox.icns"))
        )
        self.assertTrue(
            os.path.isdir(
                os.path.join(contents, "Frameworks", "ChannelPrefs.framework")
            )
        )
        self.assertFalse(
            os.path.exists(
                os.path.join(contents, "Resources", "ChannelPrefs.framework")
            )
        )
        self.assertFalse(os.path.exists(os.path.join(contents, "PkgInfo.in")))
        with open(os.path.join(contents, "PkgInfo")) as fh:
            self.assertEqual(fh.read(), "APPLMOZB")

    @unittest.skipUnless(RSYNC, "rsync is required")
    def test_stage_splits_and_copies(self):
        self._write("bin/XUL", "xul")
        self._write("bin/libfoo.dylib", "dylib")
        self._write("bin/omni.ja", "omni")
        macos_files = self._write("MacOS-files.txt", "XUL\n")
        macos_copy = self._write("MacOS-files-copy.in", "*.dylib\n")
        bundle = os.path.join(self.tmpdir, "Firefox.app")
        copy_dest = os.path.join(self.tmpdir, "Copy.app")
        spec = self._spec(
            bundle=bundle,
            stage=os.path.join(self.tmpdir, "bin"),
            macos_files=macos_files,
            macos_copy_files=macos_copy,
            copies=[copy_dest],
        )
        spec_path = self._write("spec.json", json.dumps(spec))
        self.assertEqual(main([spec_path]), 0)

        contents = os.path.join(bundle, "Contents")
        macos = os.path.join(contents, "MacOS")
        resources = os.path.join(contents, "Resources")
        self.assertTrue(os.path.exists(os.path.join(macos, "XUL")))
        self.assertTrue(os.path.exists(os.path.join(resources, "omni.ja")))
        self.assertTrue(os.path.exists(os.path.join(resources, "libfoo.dylib")))
        self.assertTrue(os.path.exists(os.path.join(macos, "libfoo.dylib")))
        self.assertFalse(os.path.exists(os.path.join(resources, "XUL")))
        self.assertFalse(os.path.exists(os.path.join(macos, "omni.ja")))
        self.assertTrue(
            os.path.exists(os.path.join(copy_dest, "Contents", "MacOS", "XUL"))
        )


if __name__ == "__main__":
    mozunit.main()
