# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from unittest import mock

import mozunit

from mozbuild.action import nsis_build
from mozbuild.util import FileAvoidWrite


class FakeOutput:
    """Stands in for the FileAvoidWrite that file_generate hands `generate`."""

    def __init__(self, name):
        self.name = name
        self.avoided = False

    def avoid_writing_to_file(self):
        self.avoided = True


class TestNsisBuild(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(mkdtemp())
        self.config_dir = self.tmpdir / "instgen"
        self.config_dir.mkdir()

    def tearDown(self):
        rmtree(self.tmpdir)

    def test_forces_output_path(self):
        output = self.tmpdir / "dist/bin/uninstall/helper.exe"

        calls = []

        def fake_run(argv, cwd=None, check=False):
            calls.append((argv, cwd, output.parent.is_dir()))
            output.write_text("exe", encoding="utf-8")
            return mock.Mock(returncode=0)

        with mock.patch.object(nsis_build.subprocess, "run", side_effect=fake_run):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
                "--makensis-flag=-nocd",
                "--output",
                str(output),
            ])

        self.assertEqual(rc, 0)
        self.assertEqual(len(calls), 1)
        argv, cwd, parent_existed = calls[0]
        # The OutFile override must follow the script to take precedence, and
        # must be absolute because makensis runs in CONFIG_DIR.
        self.assertEqual(
            argv,
            [
                "makensis",
                "-nocd",
                "uninstaller.nsi",
                f'-XOutFile "{output.resolve()}"',
            ],
        )
        self.assertEqual(Path(cwd), self.config_dir)
        self.assertTrue(parent_existed)

    def test_buildid_header_becomes_a_define(self):
        output = self.tmpdir / "setup.exe"
        header = self.tmpdir / "buildid.h"
        header.write_text("#define MOZ_BUILDID 20260914010203\n", encoding="utf-8")

        calls = []

        def fake_run(argv, cwd=None, check=False):
            calls.append(argv)
            output.write_text("exe", encoding="utf-8")
            return mock.Mock(returncode=0)

        with mock.patch.object(nsis_build.subprocess, "run", side_effect=fake_run):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "installer.nsi",
                "--makensis",
                "makensis",
                "--buildid-header",
                str(header),
                "--output",
                str(output),
            ])

        self.assertEqual(rc, 0)
        self.assertEqual(
            calls[0],
            [
                "makensis",
                "-DMOZ_BUILDID=20260914010203",
                "installer.nsi",
                f'-XOutFile "{output.resolve()}"',
            ],
        )

    def test_output_inside_config_dir(self):
        # setup.exe and the stub stay in CONFIG_DIR for repackaging.
        output = self.config_dir / "setup.exe"

        calls = []

        def fake_run(argv, cwd=None, check=False):
            calls.append(argv)
            output.write_text("exe", encoding="utf-8")
            return mock.Mock(returncode=0)

        with mock.patch.object(nsis_build.subprocess, "run", side_effect=fake_run):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "installer.nsi",
                "--makensis",
                "makensis",
                "--output",
                str(output),
            ])

        self.assertEqual(rc, 0)
        self.assertEqual(
            calls,
            [["makensis", "installer.nsi", f'-XOutFile "{output.resolve()}"']],
        )

    def test_makensis_failure_propagates(self):
        with mock.patch.object(
            nsis_build.subprocess,
            "run",
            return_value=mock.Mock(returncode=3),
        ):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
                "--output",
                str(self.tmpdir / "dist/bin/uninstall/helper.exe"),
            ])

        self.assertEqual(rc, 3)

    def test_missing_output_fails(self):
        # A successful makensis that wrote somewhere else must not pass.
        with mock.patch.object(
            nsis_build.subprocess,
            "run",
            return_value=mock.Mock(returncode=0),
        ):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
                "--output",
                str(self.tmpdir / "dist/bin/uninstall/helper.exe"),
            ])

        self.assertEqual(rc, 1)

    def test_stale_output_fails(self):
        # The l10n repack points makensis at a helper.exe the unpacked package
        # already contains, so a zero exit that wrote nothing must not pass.
        output = self.tmpdir / "dist/bin/uninstall/helper.exe"
        output.parent.mkdir(parents=True)
        output.write_text("stale", encoding="utf-8")

        with mock.patch.object(
            nsis_build.subprocess,
            "run",
            return_value=mock.Mock(returncode=0),
        ):
            rc = nsis_build.main([
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
                "--output",
                str(output),
            ])

        self.assertEqual(rc, 1)
        self.assertFalse(output.exists())

    def test_generate_writes_declared_output(self):
        # The declared edges own an objdir local output, so makensis writes it
        # directly and the FileAvoidWrite buffer opts out.
        output = FakeOutput(str(self.tmpdir / "helper.exe"))

        calls = []

        def fake_run(argv, cwd=None, check=False):
            calls.append(argv)
            Path(output.name).write_bytes(b"exe-bytes")
            return mock.Mock(returncode=0)

        with mock.patch.object(nsis_build.subprocess, "run", side_effect=fake_run):
            rc = nsis_build.generate(
                output,
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
            )

        self.assertEqual(rc, 0)
        self.assertTrue(output.avoided)
        self.assertFalse((self.config_dir / "helper.exe").exists())
        self.assertEqual(
            calls,
            [
                [
                    "makensis",
                    "uninstaller.nsi",
                    f'-XOutFile "{Path(output.name).resolve()}"',
                ]
            ],
        )

    def test_generate_survives_file_avoid_write_close(self):
        # A real FileAvoidWrite must not replace makensis' exe with its buffer.
        output = self.tmpdir / "helper.exe"

        def fake_run(argv, cwd=None, check=False):
            output.write_bytes(b"exe-bytes")
            return mock.Mock(returncode=0)

        with mock.patch.object(nsis_build.subprocess, "run", side_effect=fake_run):
            with FileAvoidWrite(str(output), readmode="rb") as fh:
                rc = nsis_build.generate(
                    fh,
                    "--config-dir",
                    str(self.config_dir),
                    "--nsi",
                    "uninstaller.nsi",
                    "--makensis",
                    "makensis",
                )

        self.assertEqual(rc, 0)
        self.assertEqual(output.read_bytes(), b"exe-bytes")

    def test_generate_propagates_failure_without_writing(self):
        output = FakeOutput(str(self.tmpdir / "helper.exe"))

        with mock.patch.object(
            nsis_build.subprocess,
            "run",
            return_value=mock.Mock(returncode=4),
        ):
            rc = nsis_build.generate(
                output,
                "--config-dir",
                str(self.config_dir),
                "--nsi",
                "uninstaller.nsi",
                "--makensis",
                "makensis",
            )

        self.assertEqual(rc, 4)
        self.assertFalse(Path(output.name).exists())


if __name__ == "__main__":
    mozunit.main()
