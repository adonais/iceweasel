# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import sys
from pathlib import Path
from unittest.mock import Mock, patch

import mozunit
import pytest
from mozharness.base.python import VirtualenvMixin
from mozharness.mozilla.testing.raptor import Raptor


@pytest.mark.parametrize("run_local", [False, True])
def test_raptor_package_pins_cover_setup(tmp_path, run_local):
    harness = Raptor.__new__(Raptor)
    harness.config = {"virtualenv_path": str(tmp_path / "venv")}
    harness.clean = False
    harness.run_local = run_local
    harness.browsertime_visualmetrics = False
    harness.raptor_path = str(tmp_path / "raptor")
    harness.query_exe = Mock(return_value=sys.executable)
    harness.platform_name = Mock(return_value="linux")
    harness.query_abs_dirs = Mock(return_value={"abs_test_install_dir": str(tmp_path)})
    harness.register_virtualenv_module = Mock()
    harness.setup_local_ffmpeg = Mock()
    harness.install_module = Mock()
    harness.package_versions = Mock()

    with patch.object(VirtualenvMixin, "create_virtualenv") as create:
        harness.create_virtualenv()

    assert harness.query_python_constraints() == [
        str(tmp_path / "config" / "requirements-raptor.txt")
    ]
    common = str(tmp_path / "raptor" / "requirements-common.txt")
    assert create.call_args.kwargs["requirements"] == [common]
    requirements = "source_requirements.txt" if run_local else "requirements.txt"
    harness.register_virtualenv_module.assert_called_once_with(
        requirements=[str(tmp_path / "raptor" / requirements)]
    )
    harness.install_module.assert_not_called()


@pytest.mark.parametrize("harness", ["raptor", "talos"])
@pytest.mark.parametrize("source", [False, True])
def test_performance_requirements_use_local_mozbase(harness, source):
    testing = Path(__file__).resolve().parents[2]
    filename = "source_requirements.txt" if source else "requirements.txt"
    requirements = testing / harness / filename

    def local_paths(path):
        result = set()
        for line in path.read_text().splitlines():
            if line.startswith("-r "):
                result.update(local_paths(path.parent / line[3:]))
            else:
                requirement = line.removeprefix("--editable ")
                if requirement.startswith("../"):
                    result.add(
                        (requirements.parent / requirement.split(";")[0]).resolve()
                    )
        return result

    expected = {path.parent for path in (testing / "mozbase").glob("*/setup.py")}
    assert expected
    assert expected <= local_paths(requirements)


if __name__ == "__main__":
    mozunit.main()
