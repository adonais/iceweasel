# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import unittest
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from unittest import mock

import mozunit
from mach.registrar import Registrar


class TestSourcePackage(unittest.TestCase):
    def setUp(self):
        self._categories = []
        for cat in ("build", "post-build", "misc", "testing", "devenv", "build-dev"):
            if cat in Registrar.categories:
                continue
            Registrar.register_category(cat, cat, cat)
            self._categories.append(cat)
        self.tmpdir = Path(mkdtemp())
        (self.tmpdir / "obj").mkdir()
        (self.tmpdir / "obj" / "buildid.h").write_text(
            "#define MOZ_BUILDID 20261022000000\n", encoding="utf-8"
        )

    def tearDown(self):
        rmtree(self.tmpdir)
        for cat in self._categories:
            del Registrar.categories[cat]
            del Registrar.commands_by_category[cat]

    def _tar_argv(self, version):
        from mozbuild.mach_commands import source_package

        command_context = mock.Mock(
            substs={
                "DIST": "dist",
                "MOZ_APP_NAME": "firefox",
                "MOZ_APP_VERSION": "1.0",
                "MOZ_WIDGET_TOOLKIT": "cocoa",
                "TAR": "gtar",
            },
            topsrcdir=str(self.tmpdir),
            topobjdir=str(self.tmpdir / "obj"),
        )
        command_context._mach_context.commands.dispatch.return_value = 0
        with mock.patch("subprocess.check_output", return_value=version):
            source_package(command_context, output=None, upload="")
        return command_context.run_process.call_args.args[0]

    def _expected(self, tar_flags):
        return [
            "gtar",
            "-cJv",
            "--owner=0",
            "--group=0",
            "--numeric-owner",
            "--exclude=./.hg*",
            "--exclude=./.git",
            "--exclude=./.gitattributes",
            "--exclude=./.gitkeep",
            "--exclude=./.gitmodules",
            "--exclude=CVS",
            "--exclude=.cvs*",
            "--exclude=./.mozconfig*",
            "--exclude=*.pyc",
            "--exclude=./Makefile",
            "--exclude=./dist",
            "--exclude=obj",
            *tar_flags,
            "-f",
            os.path.join("dist", "firefox-1.0.tar.xz"),
            "./",
        ]

    def test_source_package_gnu_tar(self):
        self.assertEqual(
            self._tar_argv("tar (GNU tar) 1.35\n"),
            self._expected(["--mode=go-w", "--transform=s,^./,firefox-1.0/,"]),
        )

    def test_source_package_bsd_tar(self):
        self.assertEqual(
            self._tar_argv("bsdtar 3.5.3 - libarchive 3.5.3\n"),
            self._expected(["-s", ",^./,firefox-1.0/,"]),
        )


if __name__ == "__main__":
    mozunit.main()
