# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import contextlib
import unittest
from pathlib import Path
from unittest import mock

import mozunit

from mozbuild.action import l10n_repackage, nsis_build, nsis_stage

_SUBSTS = {
    "MAKENSISU": "makensis",
    "MAKENSISU_FLAGS": "-nocd",
}


class TestBuildUninstaller(unittest.TestCase):
    def _run(self, locale="de", stage_rc=0, build_rc=0):
        with contextlib.ExitStack() as es:
            es.enter_context(
                mock.patch.object(l10n_repackage.buildconfig, "substs", _SUBSTS)
            )
            stage = es.enter_context(
                mock.patch.object(nsis_stage, "stage_repack", return_value=stage_rc)
            )
            build = es.enter_context(
                mock.patch.object(nsis_build, "nsis_build", return_value=build_rc)
            )
            rc = l10n_repackage._build_uninstaller(
                installer_dir=Path("/obj/browser/installer/windows"),
                locale=locale,
                real_locale_mergedir=Path("/obj/merged"),
                stagedist=Path("/obj/stage/dist"),
            )
        return rc, stage, build

    def test_builds_uninstaller_from_recorded_stage(self):
        rc, stage, build = self._run(locale="de")

        self.assertEqual(rc, 0)
        installer_dir = Path("/obj/browser/installer/windows")
        config_dir = installer_dir / "l10ngen"

        stage.assert_called_once_with(
            spec_path=installer_dir / "nsis-stage.json",
            config_dir=config_dir,
            ab_cd="de",
            real_locale_mergedir=Path("/obj/merged"),
        )

        build_kwargs = build.call_args.kwargs
        self.assertEqual(build_kwargs["config_dir"], config_dir)
        self.assertEqual(build_kwargs["nsi"], "uninstaller.nsi")
        self.assertEqual(build_kwargs["makensis"], "makensis")
        self.assertEqual(build_kwargs["makensis_flags"], ["-nocd"])
        self.assertEqual(
            build_kwargs["output"],
            str(Path("/obj/stage/dist") / "uninstall" / "helper.exe"),
        )

    def test_stage_failure_skips_build(self):
        rc, _, build = self._run(stage_rc=7)

        self.assertEqual(rc, 7)
        build.assert_not_called()

    def test_build_failure_propagates(self):
        rc, stage, build = self._run(build_rc=9)

        self.assertEqual(rc, 9)
        stage.assert_called_once()
        build.assert_called_once()


if __name__ == "__main__":
    mozunit.main()
