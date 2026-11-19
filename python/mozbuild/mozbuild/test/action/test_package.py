# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from shutil import rmtree
from tempfile import mkdtemp
from unittest import mock

import mozunit

from mozbuild.action.package import main as package_main


class TestPackageAction(unittest.TestCase):
    def setUp(self):
        self.tmpdir = mkdtemp()

    def tearDown(self):
        rmtree(self.tmpdir)

    def _tar_argv(self, version):
        with mock.patch("subprocess.check_output", return_value=version):
            with mock.patch("subprocess.call", return_value=0) as call:
                package_main([
                    "--format",
                    "TAR",
                    "--cwd",
                    self.tmpdir,
                    "--pkg-dir",
                    "firefox",
                    "--basename",
                    "firefox",
                    "--tar",
                    "tar",
                ])
        return call.call_args.args[0]

    def test_tar_gnu(self):
        self.assertEqual(
            self._tar_argv("tar (GNU tar) 1.35\n"),
            [
                "tar",
                "-c",
                "--owner=0",
                "--group=0",
                "--numeric-owner",
                "--exclude=.mkdir.done",
                "--mode=go-w",
                "-f",
                "-",
                "firefox",
            ],
        )

    def test_tar_bsd(self):
        self.assertEqual(
            self._tar_argv("bsdtar 3.5.3 - libarchive 3.5.3\n"),
            [
                "tar",
                "-c",
                "--owner=0",
                "--group=0",
                "--numeric-owner",
                "--exclude=.mkdir.done",
                "-f",
                "-",
                "firefox",
            ],
        )


if __name__ == "__main__":
    mozunit.main()
