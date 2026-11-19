# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import sys
import unittest
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from unittest import mock

import mozunit

from mozbuild.action import run_cargo
from mozbuild.rust_commands import TEST_SELECTION_ENV, CargoCommand

SELECTION_DATA = Path(__file__).parent / "data" / "rust_test_selection"
GKRUST_TESTS = {
    "manifest_path": "/src/toolkit/library/rust/Cargo.toml",
    "names": ["crashreporter", "l10nregistry", "selectors", "gkrust"],
    "features": [
        "moz_memory",
        "gkrust-shared/for_xul",
        "crashreporter/mock",
        "crashping/gecko_tests",
    ],
}
GECKODRIVER_TESTS = {
    "manifest_path": "/src/testing/geckodriver/Cargo.toml",
    "names": ["geckodriver", "webdriver"],
    "features": ["http/server"],
}


class TestRunCargo(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(mkdtemp())

    def tearDown(self):
        rmtree(self.tmpdir)

    def _spec(self, config=None, **overrides):
        edge = {
            "kind": "library",
            "manifest_path": "/src/Cargo.toml",
            "working_directory": "/obj",
        }
        edge.update(overrides)
        spec = {
            "config": config or {},
            "edge": edge,
            "topobjdir": "/obj",
            "topsrcdir": "/src",
        }
        path = self.tmpdir / "spec.json"
        path.write_text(json.dumps(spec), encoding="utf-8")
        return str(path)

    def _run(self, argv, cargo_argv=None, env=None, returncode=0):
        cargo_argv = ["cargo", "rustc"] if cargo_argv is None else cargo_argv
        env = {"E": "1"} if env is None else env
        seen = {}

        def fake_run(argv_, env=None, cwd=None, close_fds=None, check=None):
            seen.update(argv=argv_, env=env, cwd=cwd, close_fds=close_fds)
            return mock.Mock(returncode=returncode)

        with mock.patch.object(
            run_cargo, "compose_env", return_value=env
        ), mock.patch.object(
            run_cargo, "compose_cargo_build_edge_argv", return_value=cargo_argv
        ) as compose, mock.patch.object(
            run_cargo.subprocess, "run", side_effect=fake_run
        ):
            rc = run_cargo.main(argv)
        return rc, compose, seen

    def test_runs_the_composed_command(self):
        spec = self._spec(working_directory="/obj/toolkit/library/rust")
        rc, _, seen = self._run(["--spec", spec])
        self.assertEqual(rc, 0)
        self.assertEqual(seen["argv"], ["cargo", "rustc"])
        self.assertEqual(seen["env"], {"E": "1"})
        self.assertEqual(seen["cwd"], "/obj/toolkit/library/rust")
        self.assertFalse(seen["close_fds"])

    def test_composes_from_the_spec(self):
        spec = self._spec(kind="program", names=["geckodriver"])
        _, compose, _ = self._run(["--spec", spec])
        command = compose.call_args[0][0]
        self.assertEqual(command.kind, "program")
        self.assertEqual(command.names, ("geckodriver",))

    def test_forwards_runtime_signals(self):
        spec = self._spec()
        _, compose, _ = self._run([
            "--spec",
            spec,
            "--single-job",
            "--timings",
            "--keep-going",
        ])
        self.assertEqual(compose.call_args.kwargs["single_job"], True)
        self.assertEqual(compose.call_args.kwargs["timings"], True)
        self.assertEqual(compose.call_args.kwargs["keep_going"], True)

    def test_invocation_comes_from_the_environment(self):
        spec = self._spec()
        environ = {
            "BUILD_VERBOSE_LOG": "1",
            "extra_rustflags": "-Wclippy::all",
            "CARGO_RUSTCFLAGS": "-Ctarget-cpu=native",
        }
        with mock.patch.dict(run_cargo.os.environ, environ, clear=True):
            _, compose, _ = self._run(["--spec", spec])
        invocation = compose.call_args[0][2]
        self.assertEqual(invocation, run_cargo.CargoInvocation.from_environ(environ))
        self.assertTrue(invocation.verbose)
        self.assertEqual(invocation.extra_rustflags, ("-Wclippy::all",))
        self.assertEqual(invocation.cargo_rustcflags, ("-Ctarget-cpu=native",))

    def test_verbose_prints_the_command(self):
        spec = self._spec()
        with mock.patch.dict(
            run_cargo.os.environ, {"BUILD_VERBOSE_LOG": "1"}, clear=True
        ), mock.patch("builtins.print") as printed:
            self._run(["--spec", spec], cargo_argv=["cargo", "rustc", "a b"])
        self.assertEqual(printed.call_args.args[0], "cargo rustc 'a b'")

    def test_quiet_without_verbose(self):
        spec = self._spec()
        with mock.patch.dict(run_cargo.os.environ, {}, clear=True), mock.patch(
            "builtins.print"
        ) as printed:
            self._run(["--spec", spec])
        printed.assert_not_called()

    def test_runtime_signals_default_off(self):
        spec = self._spec()
        _, compose, _ = self._run(["--spec", spec])
        self.assertEqual(compose.call_args.kwargs["single_job"], False)
        self.assertEqual(compose.call_args.kwargs["timings"], False)
        self.assertEqual(compose.call_args.kwargs["keep_going"], False)

    def test_returncode_propagates(self):
        rc, _, _ = self._run(["--spec", self._spec()], returncode=17)
        self.assertEqual(rc, 17)

    def _program_spec(self, names, **overrides):
        outputs = [f"x86_64-pc-windows-msvc/release/{name}.exe" for name in names]
        spec = {
            "config": {},
            "edge": {
                "kind": "program",
                "manifest_path": "/src/Cargo.toml",
                "working_directory": str(self.tmpdir),
                "names": names,
                "outputs": outputs,
                **overrides,
            },
            "topobjdir": str(self.tmpdir),
            "topsrcdir": "/src",
        }
        path = self.tmpdir / "spec.json"
        path.write_text(json.dumps(spec), encoding="utf-8")
        target_dir = self.tmpdir / "x86_64-pc-windows-msvc" / "release"
        target_dir.mkdir(parents=True)
        return str(path), target_dir

    def test_program_pdb_gets_the_program_name(self):
        spec, target_dir = self._program_spec(["notification-helper"])
        (target_dir / "notification_helper.pdb").write_bytes(b"pdb")
        rc, _, _ = self._run(["--spec", spec])
        self.assertEqual(rc, 0)
        self.assertEqual((target_dir / "notification-helper.pdb").read_bytes(), b"pdb")

    def test_program_pdb_up_to_date(self):
        spec, target_dir = self._program_spec(["notification-helper"])
        crate_pdb = target_dir / "notification_helper.pdb"
        crate_pdb.write_bytes(b"pdb")
        os.utime(crate_pdb, (0, 0))
        (target_dir / "notification-helper.pdb").write_bytes(b"copied")
        self._run(["--spec", spec])
        self.assertEqual(
            (target_dir / "notification-helper.pdb").read_bytes(), b"copied"
        )

    def test_program_pdb_out_of_date(self):
        spec, target_dir = self._program_spec(["notification-helper"])
        (target_dir / "notification_helper.pdb").write_bytes(b"pdb")
        program_pdb = target_dir / "notification-helper.pdb"
        program_pdb.write_bytes(b"copied")
        os.utime(program_pdb, (0, 0))
        self._run(["--spec", spec])
        self.assertEqual(program_pdb.read_bytes(), b"pdb")

    def test_program_without_a_pdb_is_left_alone(self):
        spec, target_dir = self._program_spec(["notification-helper"])
        self._run(["--spec", spec])
        self.assertEqual(sorted(target_dir.iterdir()), [])

    def test_program_named_like_its_crate_needs_no_copy(self):
        spec, target_dir = self._program_spec(["geckodriver"])
        (target_dir / "geckodriver.pdb").write_bytes(b"pdb")
        self._run(["--spec", spec])
        self.assertEqual([p.name for p in target_dir.iterdir()], ["geckodriver.pdb"])

    def test_failed_cargo_run_copies_nothing(self):
        spec, target_dir = self._program_spec(["notification-helper"])
        (target_dir / "notification_helper.pdb").write_bytes(b"pdb")
        rc, _, _ = self._run(["--spec", spec], returncode=1)
        self.assertEqual(rc, 1)
        self.assertFalse((target_dir / "notification-helper.pdb").exists())

    def _test_spec(self, os_arch="Linux", **overrides):
        config = {
            "OS_ARCH": os_arch,
            "RUST_TARGET": "x86_64-unknown-linux-gnu",
            "MOZ_CARGO_DEFAULT_PROFILE_DIR": "release",
            "MOZ_CARGO_PROFILE_PREFIX": "release",
            "CARGO": "cargo",
            "MOZ_CARGO_FROZEN_ARGS": "--frozen",
        }
        spec = {
            "config": config,
            "edge": {
                "kind": "test",
                "manifest_path": "/src/Cargo.toml",
                "working_directory": str(self.tmpdir),
                "names": ["gkrust"],
                **overrides,
            },
            "topobjdir": str(self.tmpdir),
            "topsrcdir": "/src",
        }
        path = self.tmpdir / "spec.json"
        path.write_text(json.dumps(spec), encoding="utf-8")
        return str(path)

    def _run_selected(self, selection, **overrides):
        spec = self._test_spec(**{**GKRUST_TESTS, **overrides})
        with mock.patch.dict(
            run_cargo.os.environ, {TEST_SELECTION_ENV: selection}
        ), mock.patch.object(
            run_cargo.subprocess,
            "check_output",
            return_value=(SELECTION_DATA / "metadata.json").read_bytes(),
        ) as metadata:
            rc, compose, seen = self._run(["--spec", spec])
        return rc, compose, seen, metadata

    def test_test_selection(self):
        rc, compose, _, _ = self._run_selected("l10nregistry crashreporter")
        self.assertEqual(rc, 0)
        self.assertEqual(
            compose.call_args.args[0].names, ("crashreporter", "l10nregistry", "gkrust")
        )
        self.assertTrue(compose.call_args.kwargs["workspace_hack"])

    def test_test_selection_metadata_argv(self):
        _, _, _, metadata = self._run_selected("crashreporter")
        metadata.assert_called_once_with(
            [
                "cargo",
                "metadata",
                "--no-deps",
                "--frozen",
                "--format-version",
                "1",
                "--manifest-path",
                "/src/toolkit/library/rust/Cargo.toml",
            ],
            cwd=str(self.tmpdir),
        )

    def test_test_selection_other_edge(self):
        rc, compose, seen, metadata = self._run_selected("webdriver")
        self.assertEqual(rc, 0)
        compose.assert_not_called()
        metadata.assert_not_called()
        self.assertEqual(seen, {})

    def test_test_selection_library(self):
        _, compose, _, metadata = self._run_selected("crashreporter", kind="library")
        metadata.assert_not_called()
        self.assertEqual(compose.call_args.args[0].names, tuple(GKRUST_TESTS["names"]))
        self.assertEqual(compose.call_args.kwargs["workspace_hack"], True)

    def _narrow(self, crates, edge):
        with open(SELECTION_DATA / "metadata.json", encoding="utf-8") as fh:
            metadata = json.load(fh)
        packages = {package["name"]: package for package in metadata["packages"]}
        command = CargoCommand(kind="test", working_directory="/obj", **edge)
        return run_cargo.narrow_test_edge(command, crates, packages)

    def test_narrow_test_edge(self):
        command, workspace_hack = self._narrow(["crashreporter"], GKRUST_TESTS)
        self.assertEqual(command.names, ("crashreporter", "gkrust"))
        self.assertEqual(
            command.features,
            (
                "moz_memory",
                "gkrust-shared/for_xul",
                "crashreporter/mock",
                "crashping/gecko_tests",
            ),
        )
        self.assertTrue(workspace_hack)

    def test_narrow_test_edge_non_member(self):
        command, workspace_hack = self._narrow(["selectors"], GKRUST_TESTS)
        self.assertEqual(command.names, ("selectors", "gkrust"))
        self.assertEqual(command.features, ("moz_memory", "gkrust-shared/for_xul"))
        self.assertTrue(workspace_hack)

    def test_narrow_test_edge_renamed_dependency(self):
        command, workspace_hack = self._narrow(["webdriver"], GECKODRIVER_TESTS)
        self.assertEqual(command.names, ("webdriver",))
        self.assertEqual(command.features, ("http/server",))
        self.assertFalse(workspace_hack)

    def _networking(self, config=None, returncode=0, **overrides):
        base = {
            "OS_ARCH": "Linux",
            "RUST_LTO_ELIGIBLE": "1",
        }
        spec = self._spec(
            config={**base, **(config or {})},
            outputs=["x86_64-unknown-linux-gnu/release/libgkrust.a"],
            **overrides,
        )
        check_binary = mock.MagicMock()
        check_binary.main.return_value = 5
        with mock.patch.dict(
            sys.modules, {"mozbuild.action.check_binary": check_binary}
        ):
            rc, _, _ = self._run(["--spec", spec], returncode=returncode)
        return rc, check_binary.main

    def test_networking_check(self):
        rc, check = self._networking()
        self.assertEqual(rc, 5)
        self.assertEqual(
            check.call_args.args[0],
            [
                "--networking",
                str(Path("/obj", "x86_64-unknown-linux-gnu/release/libgkrust.a")),
            ],
        )

    def test_networking_check_skipped(self):
        for config, overrides in (
            ({"OS_ARCH": "Darwin"}, {}),
            ({"RUST_LTO_ELIGIBLE": ""}, {}),
            ({}, {"lto": False}),
            ({}, {"kind": "host-library"}),
            ({"MOZ_PROFILE_GENERATE": "1"}, {}),
            ({"RUST_SANCOV_FLAGS": "-Cpasses=sancov-module"}, {}),
            ({"MOZ_ASAN": "1"}, {}),
            ({"MOZ_TSAN": "1"}, {}),
            ({"MOZ_UBSAN": "1"}, {}),
            ({"MOZ_LTO_RUST_CROSS": "1"}, {}),
        ):
            rc, check = self._networking(config, **overrides)
            self.assertEqual(rc, 0, (config, overrides))
            self.assertEqual(check.call_count, 0, (config, overrides))

    def test_networking_check_after_failed_build(self):
        rc, check = self._networking(returncode=2)
        self.assertEqual(rc, 2)
        self.assertEqual(check.call_count, 0)

    def test_env_rustflags_not_recomposed(self):
        configured = {
            "MOZ_RUST_DEFAULT_FLAGS": "-C debuginfo=2 -Dwarnings",
            "RUST_SANCOV_FLAGS": "-Cpasses=sancov-module -Cllvm-args=-x",
            "RUSTFLAGS": "",
            "MOZ_RUSTFLAGS_CODEGEN": "-C codegen-units=1",
            "CARGO": "cargo",
            "MOZ_CARGO_TARGET_ARGS": "--target=i686-unknown-linux-gnu",
        }
        spec = self._spec(config=configured)
        composed = (
            "-C debuginfo=2 -Dwarnings -Cpasses=sancov-module "
            "-Cllvm-args=-x -C codegen-units=1"
        )
        seen = {}

        def fake_run(argv_, env=None, cwd=None, close_fds=None, check=None):
            seen["env"] = env
            return mock.Mock(returncode=0)

        with mock.patch.dict(
            run_cargo.os.environ, {"RUSTFLAGS": composed}, clear=False
        ), mock.patch.object(run_cargo.subprocess, "run", side_effect=fake_run):
            rc = run_cargo.main(["--spec", spec])

        self.assertEqual(rc, 0)
        rustflags = seen["env"]["RUSTFLAGS"]
        self.assertEqual(rustflags.count("-Cpasses=sancov-module"), 1)
        self.assertEqual(rustflags.count("codegen-units=1"), 1)


if __name__ == "__main__":
    mozunit.main()
