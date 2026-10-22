# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import unittest

import mozunit
from mozshellutil import split as shell_split

from mozbuild.rust_commands import (
    CARGO_CONFIG_KEYS,
    CargoCommand,
    CargoConfig,
    CargoInvocation,
    applies_library_lto,
    cargo_spec,
    compose_cargo_build_edge_argv,
    compose_env,
    compose_mach_cargo_argv,
    load_cargo_spec,
)

TARGET = "x86_64-unknown-linux-gnu"
TARGET_ARGS = [f"--target={TARGET}"]


def _cmd(**kw):
    kw.setdefault("kind", "library")
    kw.setdefault("manifest_path", "/src/toolkit/library/rust/Cargo.toml")
    kw.setdefault("working_directory", "/obj/toolkit/library/rust")
    return CargoCommand(**kw)


def _env(cmd, substs, environ=None, invocation=None, **kw):
    return compose_env(
        cmd,
        substs,
        environ or {},
        invocation or CargoInvocation(),
        "/src",
        "/obj",
        **kw,
    )


def _rustflags(cmd, substs, invocation=None, **kw):
    return _env(cmd, substs, invocation=invocation, **kw)["RUSTFLAGS"]


def _argv(cmd, substs, invocation=None, **kw):
    return compose_cargo_build_edge_argv(
        cmd, substs, invocation or CargoInvocation(), **kw
    )


def _substs(**kw):
    kw.setdefault("CARGO", "cargo")
    kw.setdefault("MOZ_CARGO_TARGET_ARGS", TARGET_ARGS)
    return kw


class TestCargoCommand(unittest.TestCase):
    def test_sequences_become_tuples(self):
        cmd = _cmd(names=["a"], features=["b", "c"])
        self.assertEqual(cmd.names, ("a",))
        self.assertEqual(cmd.features, ("b", "c"))

    def test_unknown_key_rejected(self):
        data = {
            "kind": "library",
            "manifest_path": "x",
            "working_directory": "/obj/x",
            "bogus": 1,
        }
        with self.assertRaises(TypeError):
            CargoCommand(**data)

    def test_missing_working_directory_rejected(self):
        data = {
            "kind": "library",
            "manifest_path": "x",
            "working_directory": "",
        }
        with self.assertRaises(ValueError):
            CargoCommand(**data)

    def test_bad_kind_rejected(self):
        data = {
            "kind": "nope",
            "manifest_path": "x",
            "working_directory": "/obj/x",
        }
        with self.assertRaises(ValueError):
            CargoCommand(**data)


class TestCargoInvocation(unittest.TestCase):
    def test_defaults_from_an_empty_environment(self):
        self.assertEqual(CargoInvocation.from_environ({}), CargoInvocation())

    def test_from_environ(self):
        invocation = CargoInvocation.from_environ({
            "BUILD_VERBOSE_LOG": "1",
            "MACH_STDOUT_ISATTY": "1",
            "extra_rustflags": "-Wclippy::all -Dwarnings",
            "CARGO_RUSTCFLAGS": "-C 'link-arg=-L/opt/my libs'",
            "CARGO_EXTRA_FLAGS": "--offline",
            "RUSTC_BOOTSTRAP": "1",
        })
        self.assertEqual(
            invocation,
            CargoInvocation(
                verbose=True,
                color="always",
                extra_rustflags=("-Wclippy::all", "-Dwarnings"),
                cargo_rustcflags=("-C", "link-arg=-L/opt/my libs"),
                cargo_extra_flags=("--offline",),
                rustc_bootstrap="1",
            ),
        )

    def test_no_ansi_disables_color(self):
        invocation = CargoInvocation.from_environ({
            "MACH_STDOUT_ISATTY": "1",
            "NO_ANSI": "1",
        })
        self.assertEqual(invocation.color, "never")

    def test_color_needs_a_tty(self):
        self.assertEqual(CargoInvocation.from_environ({"NO_ANSI": "1"}).color, "")

    def test_zero_valued_signals_are_off(self):
        invocation = CargoInvocation.from_environ({"BUILD_VERBOSE_LOG": "0"})
        self.assertFalse(invocation.verbose)


ELIGIBLE = {"RUST_LTO_ELIGIBLE": "1"}


class TestAppliesLibraryLto(unittest.TestCase):
    def test_release_library(self):
        self.assertTrue(applies_library_lto("library", True, ELIGIBLE))

    def test_library_that_opted_out(self):
        self.assertFalse(applies_library_lto("library", False, ELIGIBLE))

    def test_opt_out_drops_the_flag(self):
        argv = _argv(_cmd(lto=False), _substs(RUST_LTO_ELIGIBLE="1"))
        self.assertEqual(argv[argv.index("--") + 1 :], [])

    def test_lto_applies_by_default(self):
        argv = _argv(_cmd(), _substs(RUST_LTO_ELIGIBLE="1"))
        self.assertEqual(argv[argv.index("--") + 1 :], ["-Clto"])

    def test_not_eligible(self):
        self.assertFalse(applies_library_lto("library", True, {}))

    def test_host_library(self):
        self.assertFalse(applies_library_lto("host-library", True, ELIGIBLE))

    def test_program(self):
        self.assertFalse(applies_library_lto("program", True, ELIGIBLE))


class TestCargoSpec(unittest.TestCase):
    def test_config_keys_are_sorted(self):
        self.assertEqual(list(CARGO_CONFIG_KEYS), sorted(CARGO_CONFIG_KEYS))

    def test_roundtrip(self):
        cmd = _cmd(
            features=("a",), rustflags=("-Cfoo",), rustc_flags=("-Cbar",), lto=False
        )
        substs = {"CARGO": "cargo", "MOZ_CARGO_TARGET_ARGS": ["--target=t"]}
        command, out_substs, topsrcdir, topobjdir = load_cargo_spec(
            json.loads(json.dumps(cargo_spec(cmd, substs, "/src", "/obj")))
        )
        self.assertEqual(command, cmd)
        self.assertEqual({k: out_substs[k] for k in substs}, substs)
        self.assertEqual(topsrcdir, "/src")
        self.assertEqual(topobjdir, "/obj")

    def test_carries_only_the_declared_keys(self):
        substs = {
            "CARGO": "cargo",
            "MOZ_RUSTFLAGS_CODEGEN": ["-C", "codegen-units=1"],
            "MOZ_APP_NAME": "firefox",
            "OS_ARCH": "Linux",
            "CC": ["clang"],
        }
        config = cargo_spec(_cmd(), substs, "/src", "/obj")["config"]
        self.assertEqual(
            config,
            {"CARGO": "cargo", "MOZ_RUSTFLAGS_CODEGEN": ["-C", "codegen-units=1"]},
        )

    def test_converted_substitutions_raise(self):
        substs = CargoConfig({"CARGOFLAGS": "--color 'always'"})
        with self.assertRaises(TypeError):
            cargo_spec(_cmd(), substs, "/src", "/obj")

    def test_values_are_converted_once(self):
        config = CargoConfig({
            "CARGO": "cargo",
            "MOZ_CARGO_CC": "clang --driver-mode=cl",
            "CARGOFLAGS": "--color 'always'",
            "RUST_LTO_ELIGIBLE": "1",
            "MOZ_LTO_OBJECT_PATH": "0",
        })
        self.assertEqual(config.get("CARGO"), "cargo")
        self.assertEqual(config.get("MOZ_CARGO_CC"), ["clang", "--driver-mode=cl"])
        self.assertEqual(config.get("CARGOFLAGS"), ["--color", "always"])
        self.assertIs(config.get("RUST_LTO_ELIGIBLE"), True)
        self.assertIs(config.get("MOZ_LTO_OBJECT_PATH"), False)

    def test_absent_key_reads_as_its_empty_value(self):
        config = CargoConfig({"CARGO": "cargo"})
        self.assertEqual(config.get("RUST_TARGET"), "")
        self.assertEqual(config.get("MOZ_RUSTFLAGS_TARGET_LTOABLE"), [])
        self.assertIs(config.get("RUST_LTO_ELIGIBLE"), False)
        self.assertEqual(config.get("CARGOFLAGS"), [])

    def test_a_read_cannot_reach_back_into_the_config(self):
        config = CargoConfig({"MOZ_RUST_DEFAULT_FLAGS": "-Cdebuginfo=2"})
        flags = config.get("MOZ_RUST_DEFAULT_FLAGS")
        flags.append("-Cpanic=abort")
        self.assertEqual(config.get("MOZ_RUST_DEFAULT_FLAGS"), ["-Cdebuginfo=2"])

    def test_undeclared_key_raises(self):
        config = CargoConfig({"CARGO": "cargo"})
        self.assertEqual(config.get("CARGO"), "cargo")
        for key in ("MOZ_APP_NAME", "OS_ARCH", "MOZ_TSAN", "CC_TYPE"):
            for read in (
                lambda: config.get(key),
                lambda: config[key],
                lambda: key in config,
            ):
                with self.assertRaisesRegex(KeyError, "CARGO_CONFIG_KEYS"):
                    read()


class TestComposeArgv(unittest.TestCase):
    def test_library(self):
        substs = _substs(RUST_LTO_ELIGIBLE="1")
        cmd = _cmd(features=("gkrust-shared/foo",))
        argv = _argv(cmd, substs)
        self.assertEqual(argv[:2], ["cargo", "rustc"])
        self.assertIn("--lib", argv)
        self.assertIn("--target=x86_64-unknown-linux-gnu", argv)
        i = argv.index("--features")
        self.assertEqual(
            argv[i + 1], "gkrust-shared/foo,mozilla-central-workspace-hack"
        )
        self.assertEqual(argv[argv.index("--") + 1 :], ["-Clto"])

    def test_features_empty(self):
        argv = _argv(_cmd(features=()), {"CARGO": "cargo"})
        self.assertEqual(
            argv[argv.index("--features") + 1], "mozilla-central-workspace-hack"
        )

    def test_host_library_targets_host_and_has_no_rustc_tail(self):
        substs = {
            "CARGO": "cargo",
            "MOZ_CARGO_TARGET_ARGS": ["--target=aarch64-linux-android"],
            "MOZ_CARGO_HOST_TARGET_ARGS": ["--target=x86_64-pc-windows-msvc"],
        }
        argv = _argv(_cmd(kind="host-library"), substs)
        self.assertIn("--target=x86_64-pc-windows-msvc", argv)
        self.assertNotIn("--target=aarch64-linux-android", argv)
        self.assertNotIn("--", argv)

    def test_test_subcommand_has_no_rustc_tail(self):
        cmd = _cmd(kind="test", names=("style",))
        argv = _argv(cmd, {"CARGO": "cargo"})
        self.assertEqual(argv[1], "test")
        self.assertNotIn("--", argv)
        for arg in ("--no-fail-fast", "-p", "style"):
            self.assertIn(arg, argv)

    def test_program_edge_rustc_flags(self):
        cmd = _cmd(
            kind="program",
            names=("nmhproxy",),
            rustc_flags=("-C", "link-arg=/obj/browser/app/nmhproxy/module.res"),
        )
        argv = _argv(cmd, _substs())
        self.assertEqual(argv[argv.index("--bin") + 1], "nmhproxy")
        self.assertEqual(
            argv[argv.index("--") + 1 :],
            ["-C", "link-arg=/obj/browser/app/nmhproxy/module.res"],
        )

    def test_library_flags_do_not_reach_programs(self):
        substs = _substs(
            MOZ_RUST_LIBRARY_RUSTCFLAGS=["-C", "target-feature=-crt-static"],
        )
        argv = _argv(_cmd(), substs)
        self.assertEqual(
            argv[argv.index("--") + 1 :], ["-C", "target-feature=-crt-static"]
        )
        argv = _argv(_cmd(kind="program", names=("p",)), substs)
        self.assertNotIn("target-feature=-crt-static", argv)

    def test_cargo_rustcflags_follow_the_derived_rustc_flags(self):
        substs = _substs(RUST_LTO_ELIGIBLE="1")
        argv = _argv(
            _cmd(),
            substs,
            CargoInvocation(cargo_rustcflags=("-Ctarget-cpu=native",)),
        )
        self.assertEqual(argv[argv.index("--") + 1 :], ["-Clto", "-Ctarget-cpu=native"])

    def test_cargo_rustcflags_skip_edges_without_a_rustc_tail(self):
        for kind in ("host-library", "host-program", "test"):
            argv = _argv(
                _cmd(kind=kind, names=("thing",)),
                _substs(MOZ_CARGO_HOST_TARGET_ARGS=TARGET_ARGS),
                CargoInvocation(cargo_rustcflags=("-Ctarget-cpu=native",)),
            )
            self.assertNotIn("-Ctarget-cpu=native", argv)

    def test_cargoflags_come_first(self):
        substs = {"CARGO": "cargo", "CARGOFLAGS": "--offline"}
        argv = _argv(_cmd(), substs)
        self.assertEqual(argv[2], "--offline")

    def test_cargoflags_honor_shell_quoting(self):
        argv = _argv(_cmd(), {"CARGO": "cargo", "CARGOFLAGS": "--config 'k = \"v\"'"})
        self.assertEqual(argv[argv.index("--config") + 1], 'k = "v"')

    def test_cargoflags_from_a_single_option_value_are_split(self):
        # A nargs=1 option holds the whole fragment in one element.
        argv = _argv(_cmd(), {"CARGO": "cargo", "CARGOFLAGS": ["--offline --locked"]})
        self.assertIn("--offline", argv)
        self.assertIn("--locked", argv)

    def test_configured_build_arguments_in_order(self):
        substs = _substs(
            CARGOFLAGS="--offline",
            MOZ_CARGO_DEFAULT_PROFILE_ARGS=["--release"],
            MOZ_CARGO_FROZEN_ARGS=["--frozen"],
            MOZ_CARGO_BUILD_STD_ARGS=["-Zbuild-std=std,panic_abort"],
        )
        cmd = _cmd()
        argv = _argv(
            cmd,
            substs,
            CargoInvocation(verbose=True, json_output=True, color="always"),
            single_job=True,
        )
        self.assertEqual(
            argv[2 : argv.index("--lib")],
            [
                "--offline",
                "--release",
                "--frozen",
                "--manifest-path",
                cmd.manifest_path,
                "-vv",
                "--message-format=json",
                "--color=always",
                "-j1",
                "-Zbuild-std=std,panic_abort",
            ],
        )

    def test_color_not_added_when_cargoflags_set_it(self):
        argv = _argv(
            _cmd(),
            {"CARGO": "cargo", "CARGOFLAGS": "--color=never"},
            CargoInvocation(color="always"),
        )
        self.assertEqual(
            [a for a in argv if a.startswith("--color")], ["--color=never"]
        )

    def test_forced_j1_wins_over_cargoflags_j(self):
        # The explicit single job override must follow and override CARGOFLAGS.
        argv = _argv(_cmd(), {"CARGO": "cargo", "CARGOFLAGS": "-j8"}, single_job=True)
        self.assertLess(argv.index("-j8"), argv.index("-j1"))

    def test_runtime_signals_positions(self):
        argv = _argv(
            _cmd(),
            {"CARGO": "cargo"},
            timings=True,
            keep_going=True,
            single_job=True,
        )
        self.assertEqual(argv[1:4], ["rustc", "--timings", "--keep-going"])
        self.assertLess(argv.index("-j1"), argv.index("--"))

    def test_custom_profile_library_gets_its_crate_type(self):
        argv = _argv(
            _cmd(cargo_profile_suffix="megazord", cargo_crate_type="staticlib"),
            {"CARGO": "cargo", "MOZ_CARGO_PROFILE_PREFIX": "release"},
        )
        self.assertEqual(argv[argv.index("--profile") + 1], "release-megazord")
        self.assertEqual(argv[argv.index("--crate-type") + 1], "staticlib")

    def test_custom_profile_replaces_the_default_profile_arguments(self):
        argv = _argv(
            _cmd(cargo_profile_suffix="megazord"),
            {
                "CARGO": "cargo",
                "MOZ_CARGO_PROFILE_PREFIX": "dev",
                "MOZ_CARGO_DEFAULT_PROFILE_ARGS": ["--release"],
            },
        )
        self.assertEqual(argv[argv.index("--profile") + 1], "dev-megazord")
        self.assertNotIn("--release", argv)

    def test_custom_profile_test_edge_omits_crate_type(self):
        # A colocated test edge uses the profile but must not receive
        # --crate-type staticlib, which `cargo test` rejects.
        cmd = _cmd(
            kind="test", cargo_profile_suffix="megazord", cargo_crate_type="staticlib"
        )
        argv = _argv(cmd, {"CARGO": "cargo", "MOZ_CARGO_PROFILE_PREFIX": "release"})
        self.assertEqual(argv[1], "test")
        self.assertEqual(argv[argv.index("--profile") + 1], "release-megazord")
        self.assertNotIn("--crate-type", argv)

    def test_test_edge_exact_argv(self):
        # Later CARGO_EXTRA_FLAGS override shared test build flags.
        cmd = _cmd(kind="test", features=("f",), names=("style",))
        argv = _argv(
            cmd,
            _substs(
                MOZ_CARGO_TARGET_ARGS=["--target=t"],
                CARGOFLAGS="--offline",
                MOZ_CARGO_DEFAULT_PROFILE_ARGS=["--release"],
                MOZ_CARGO_FROZEN_ARGS=["--frozen"],
            ),
            CargoInvocation(cargo_extra_flags=("--extra",)),
        )
        self.assertEqual(
            argv,
            [
                "cargo",
                "test",
                "--target=t",
                "--no-fail-fast",
                "-p",
                "style",
                "--features",
                "f,mozilla-central-workspace-hack",
                "--offline",
                "--release",
                "--frozen",
                "--manifest-path",
                cmd.manifest_path,
                "--extra",
            ],
        )

    def test_unquoted_metacharacter_rejected(self):
        from mozshellutil import MetaCharacterException

        with self.assertRaises(MetaCharacterException):
            _argv(_cmd(), {"CARGO": "cargo", "CARGOFLAGS": "--x; --y"})


FRAGMENTS = {
    "MOZ_RUST_DEFAULT_FLAGS": ["-Cdefault"],
    "MOZ_RUSTFLAGS_AFTER_EXTRA": ["-Clto=off"],
    "RUST_SANCOV_FLAGS": ["-Csancov"],
    "RUSTFLAGS": ["-Cuser"],
    "MOZ_RUSTFLAGS_TARGET_COMMON": ["-Ccommon"],
    "MOZ_RUSTFLAGS_TARGET_LTOABLE": ["-Cltoable"],
    "MOZ_RUSTFLAGS_CODEGEN": ["-C", "codegen-units=1"],
}


class TestComposeRustflags(unittest.TestCase):
    def test_target_library_exact_order(self):
        out = _rustflags(
            _cmd(rustflags=("-Cedge",)),
            FRAGMENTS,
            CargoInvocation(extra_rustflags=("-Wclippy::all",)),
        )
        self.assertEqual(
            out,
            "-Cdefault -Wclippy::all -Clto=off -Csancov -Cuser -Ccommon -Cltoable"
            " -C codegen-units=1 -Cedge",
        )

    def test_extra_rustflags_follow_the_default_flags(self):
        # Clippy relies on this order to override a default -Dwarnings.
        out = _rustflags(
            _cmd(),
            {"MOZ_RUST_DEFAULT_FLAGS": ["-Dwarnings"]},
            CargoInvocation(extra_rustflags=("-Wwarnings",)),
        ).split()
        self.assertEqual(out, ["-Dwarnings", "-Wwarnings"])

    def test_host_edge_gets_shared_fragments_only(self):
        out = _rustflags(
            _cmd(kind="host-library"),
            FRAGMENTS,
            CargoInvocation(extra_rustflags=("-Wclippy::all",)),
        )
        self.assertEqual(out, "-Cdefault -Wclippy::all -Clto=off -C codegen-units=1")

    def test_nonltoable_edges_omit_the_ltoable_fragment(self):
        for kind in ("program", "test"):
            out = _rustflags(_cmd(kind=kind, names=("x",)), FRAGMENTS).split()
            self.assertIn("-Ccommon", out)
            self.assertNotIn("-Cltoable", out)

    def test_ltoable_override_forces_the_fragment_on_a_program(self):
        out = _rustflags(
            _cmd(kind="program", names=("x",)), FRAGMENTS, ltoable=True
        ).split()
        self.assertIn("-Cltoable", out)

    def test_ltoable_override_can_disable_it_for_a_library(self):
        out = _rustflags(_cmd(), FRAGMENTS, ltoable=False).split()
        self.assertNotIn("-Cltoable", out)

    def test_user_rustflags_from_a_single_option_value_are_split(self):
        out = _rustflags(_cmd(), {"RUSTFLAGS": ["-Cfoo -Zsanitizer=address"]}).split()
        self.assertEqual(out, ["-Cfoo", "-Zsanitizer=address"])

    def test_default_linker_libraries_apply_to_target_edges_only(self):
        substs = {
            "MOZ_RUSTFLAGS_DEFAULT_LINKER_LIBRARIES": [
                "-C",
                "default-linker-libraries=yes",
            ]
        }
        self.assertEqual(
            _rustflags(_cmd(kind="program", names=("x",)), substs),
            "-C default-linker-libraries=yes",
        )
        self.assertEqual(
            _rustflags(_cmd(kind="host-program", names=("x",)), substs), ""
        )

    def test_edge_rustflags_come_last(self):
        cmd = _cmd(kind="test", rustflags=("-C", "link-arg=-Wl,-rpath,/obj/dist/bin"))
        out = _rustflags(cmd, FRAGMENTS)
        self.assertTrue(
            out.endswith("-C codegen-units=1 -C link-arg=-Wl,-rpath,/obj/dist/bin")
        )


class TestComposeEnv(unittest.TestCase):
    def test_cross_build_keeps_host_and_target_toolchains_distinct(self):
        substs = {
            "MOZ_CARGO_CC_ENV_SUFFIX": "aarch64_linux_android",
            "MOZ_CARGO_HOST_CC_ENV_SUFFIX": "x86_64_unknown_linux_gnu",
            "MOZ_CARGO_CC": ["target-clang"],
            "AR": "target-ar",
            "MOZ_CARGO_HOST_CC": ["/usr/bin/sccache", "host-clang"],
            "HOST_AR": "host-ar",
        }
        # Host edges still populate both host and target tool variables.
        env = _env(_cmd(kind="host-library"), substs)
        self.assertEqual(
            env["CC_x86_64_unknown_linux_gnu"], "/usr/bin/sccache host-clang"
        )
        self.assertEqual(env["CC_aarch64_linux_android"], "target-clang")
        self.assertEqual(env["AR_x86_64_unknown_linux_gnu"], "host-ar")
        self.assertEqual(env["AR_aarch64_linux_android"], "target-ar")

    def test_target_values_win_when_host_and_target_match(self):
        substs = {
            "MOZ_CARGO_CC_ENV_SUFFIX": "t",
            "MOZ_CARGO_HOST_CC_ENV_SUFFIX": "t",
            "MOZ_CARGO_CC": ["target-clang"],
            "MOZ_CARGO_HOST_CC": ["host-clang"],
            "MOZ_CARGO_CFLAGS_BASE": ["-target"],
            "MOZ_CARGO_HOST_CFLAGS_BASE": ["-host"],
            "MOZ_CARGO_LINKER_ENV_VAR": "CARGO_TARGET_T_LINKER",
            "MOZ_CARGO_HOST_LINKER_ENV_VAR": "CARGO_TARGET_T_LINKER",
            "MOZ_CARGO_LINKER": "/src/build/cargo-linker",
            "MOZ_CARGO_HOST_LINKER": "/src/build/cargo-host-linker",
        }
        env = _env(_cmd(kind="host-library"), substs)
        self.assertEqual(env["CC_t"], "target-clang")
        self.assertEqual(env["CFLAGS_t"], "-target")
        self.assertEqual(env["CARGO_TARGET_T_LINKER"], "/src/build/cargo-linker")

    def test_bindgen_extra_clang_args_come_from_configure(self):
        env = _env(
            _cmd(), {"BINDGEN_EXTRA_CLANG_ARGS": ["--target=aarch64-linux-android26"]}
        )
        self.assertEqual(
            env["BINDGEN_EXTRA_CLANG_ARGS"], "--target=aarch64-linux-android26"
        )
        self.assertEqual(_env(_cmd(), {})["BINDGEN_EXTRA_CLANG_ARGS"], "")

    def test_known_wrapper_custom_is_only_set_when_configured(self):
        self.assertNotIn("CC_KNOWN_WRAPPER_CUSTOM", _env(_cmd(), {}))
        env = _env(_cmd(), {"CC_KNOWN_WRAPPER_CUSTOM": "kache"})
        self.assertEqual(env["CC_KNOWN_WRAPPER_CUSTOM"], "kache")

    def test_rustc_wrapper_is_only_set_when_configured(self):
        self.assertNotIn("RUSTC_WRAPPER", _env(_cmd(), {}))
        env = _env(_cmd(), {"MOZ_RUSTC_WRAPPER": "/usr/bin/sccache"})
        self.assertEqual(env["RUSTC_WRAPPER"], "/usr/bin/sccache")
        env = _env(_cmd(), {}, {"RUSTC_WRAPPER": "/inherited/sccache"})
        self.assertEqual(env["RUSTC_WRAPPER"], "/inherited/sccache")

    def test_clippy_replaces_the_rustc_wrapper(self):
        substs = {
            "MOZ_RUSTC_WRAPPER": "/usr/bin/sccache",
            "MOZ_CARGO_CLIPPY_WRAPPER": "/src/build/cargo-clippy-wrapper",
        }
        env = _env(_cmd(), substs, subcommand="clippy")
        self.assertEqual(env["RUSTC_WRAPPER"], "/src/build/cargo-clippy-wrapper")
        env = _env(_cmd(), substs, {"RUSTC_WRAPPER": "/inherited"}, subcommand="clippy")
        self.assertEqual(env["RUSTC_WRAPPER"], "/src/build/cargo-clippy-wrapper")
        env = _env(_cmd(), substs, subcommand="check")
        self.assertEqual(env["RUSTC_WRAPPER"], "/usr/bin/sccache")

    def test_pkg_config_vars_only_set_when_configured(self):
        env = _env(_cmd(), {"PKG_CONFIG_PATH": "/from/configure"})
        self.assertEqual(env["PKG_CONFIG_PATH"], "/from/configure")
        self.assertEqual(env["PKG_CONFIG_ALLOW_CROSS"], "1")

    def test_pkg_config_vars_absent_leave_the_environment(self):
        env = _env(_cmd(), {}, {"PKG_CONFIG_PATH": "/inherited"})
        self.assertEqual(env["PKG_CONFIG_PATH"], "/inherited")
        self.assertNotIn("PKG_CONFIG", env)

    def test_configured_empty_pkg_config_path_clears_the_environment(self):
        env = _env(
            _cmd(),
            {"PKG_CONFIG_PATH": "", "PKG_CONFIG_LIBDIR": "/sysroot/usr/lib/pkgconfig"},
            {"PKG_CONFIG_PATH": "/host"},
        )
        self.assertEqual(env["PKG_CONFIG_PATH"], "")
        self.assertEqual(env["PKG_CONFIG_LIBDIR"], "/sysroot/usr/lib/pkgconfig")

    def test_rustc_bootstrap(self):
        substs = {"MOZ_RUSTC_BOOTSTRAP_DEFAULT": "mozglue_static,qcms"}
        self.assertEqual(_env(_cmd(), substs)["RUSTC_BOOTSTRAP"], "mozglue_static,qcms")
        env = _env(_cmd(), substs, invocation=CargoInvocation(rustc_bootstrap="1"))
        self.assertEqual(env["RUSTC_BOOTSTRAP"], "1")
        env = _env(
            _cmd(),
            {**substs, "MOZ_RUSTC_BOOTSTRAP_FORCE": "1"},
            invocation=CargoInvocation(rustc_bootstrap="qcms"),
        )
        self.assertEqual(env["RUSTC_BOOTSTRAP"], "1")

    def test_wrap_ldflags_wraps_lto_and_pgo_around_link_flags(self):
        substs = {"MOZ_LTO_LDFLAGS": ["-flto"], "RUST_PGO_LDFLAGS": ["-Cpgo-ld"]}
        env = _env(_cmd(link_flags=("-Wl,-z,relro",)), substs)
        self.assertEqual(env["MOZ_CARGO_WRAP_LDFLAGS"], "-flto -Wl,-z,relro -Cpgo-ld")

    def test_wrap_ldflags_quotes_link_flags(self):
        lib = r"C:\clang\lib\windows\clang_rt.profile-x86_64.lib"
        env = _env(_cmd(link_flags=(lib, "-Wl,-z,relro")), {})
        self.assertEqual(
            shell_split(env["MOZ_CARGO_WRAP_LDFLAGS"]), [lib, "-Wl,-z,relro"]
        )

    def test_program_keeps_fsanitize_without_a_configured_filter(self):
        cmd = _cmd(kind="program", link_flags=("-fsanitize=address",))
        env = _env(cmd, {})
        self.assertIn("-fsanitize=address", env["MOZ_CARGO_WRAP_LDFLAGS"])

    def test_program_filter_applies_to_programs_only(self):
        substs = {"MOZ_CARGO_PROGRAM_LDFLAGS_FILTER_OUT": ["-fsanitize=%"]}
        program = _cmd(
            kind="program", link_flags=("-fsanitize=address", "-Wl,-z,relro")
        )
        self.assertEqual(
            _env(program, substs)["MOZ_CARGO_WRAP_LDFLAGS"], "-Wl,-z,relro"
        )
        library = _cmd(link_flags=("-fsanitize=address",))
        self.assertIn(
            "-fsanitize=address", _env(library, substs)["MOZ_CARGO_WRAP_LDFLAGS"]
        )

    def test_target_filter_applies_to_every_target_edge(self):
        substs = {"MOZ_CARGO_LDFLAGS_FILTER_OUT": ["-fsanitize=%"]}
        for kind in ("library", "program", "test"):
            cmd = _cmd(kind=kind, link_flags=("-fsanitize=thread", "-Wl,-z,relro"))
            self.assertEqual(
                _env(cmd, substs)["MOZ_CARGO_WRAP_LDFLAGS"], "-Wl,-z,relro"
            )

    def test_make_filter_patterns(self):
        substs = {"MOZ_CARGO_LDFLAGS_FILTER_OUT": ["-Wl,%,relro", "-lfoo"]}
        cmd = _cmd(link_flags=("-Wl,-z,relro", "-Wl,-z,now", "-lfoo", "-lfoobar"))
        self.assertEqual(
            _env(cmd, substs)["MOZ_CARGO_WRAP_LDFLAGS"], "-Wl,-z,now -lfoobar"
        )

    def test_lto_object_path_stages_objects_per_edge(self):
        substs = {"MOZ_LTO_OBJECT_PATH": "1"}
        cmd = _cmd(kind="program", names=("geckodriver",))
        env = _env(cmd, substs)
        self.assertIn(
            "-Wl,-object_path_lto,geckodriver.lto.o/", env["MOZ_CARGO_WRAP_LDFLAGS"]
        )
        self.assertIn(
            "-Wl,-object_path_lto,tests.lto.o/",
            _env(_cmd(kind="test"), substs)["MOZ_CARGO_WRAP_LDFLAGS"],
        )
        self.assertNotIn("object_path_lto", _env(cmd, {})["MOZ_CARGO_WRAP_LDFLAGS"])

    def test_host_edges_use_the_host_linker_values(self):
        substs = {
            "MOZ_CARGO_LD": ["clang", "--target=t"],
            "MOZ_CARGO_LD_CXX": ["clang++", "--target=t"],
            "MOZ_CARGO_HOST_LD": ["host-clang"],
            "MOZ_CARGO_HOST_LD_CXX": ["host-clang++"],
            "MOZ_CARGO_HOST_LDFLAGS": ["-fuse-ld=lld", '"-LIBPATH:C:/lib"'],
        }
        host = _env(_cmd(kind="host-program", names=("x",)), substs)
        self.assertEqual(host["MOZ_CARGO_WRAP_LD"], "host-clang")
        self.assertEqual(host["MOZ_CARGO_WRAP_LD_CXX"], "host-clang++")
        self.assertEqual(
            host["MOZ_CARGO_WRAP_LDFLAGS"], '-fuse-ld=lld "-LIBPATH:C:/lib"'
        )
        target = _env(_cmd(link_flags=("-Wl,-z,relro",)), substs)
        self.assertEqual(target["MOZ_CARGO_WRAP_LD"], "clang --target=t")
        self.assertEqual(target["MOZ_CARGO_WRAP_LD_CXX"], "clang++ --target=t")
        self.assertEqual(target["MOZ_CARGO_WRAP_LDFLAGS"], "-Wl,-z,relro")
        for env in (host, target):
            self.assertEqual(env["MOZ_CARGO_WRAP_HOST_LD"], "host-clang")
            self.assertEqual(env["MOZ_CARGO_WRAP_HOST_LD_CXX"], "host-clang++")
            self.assertEqual(
                env["MOZ_CARGO_WRAP_HOST_LDFLAGS"], '-fuse-ld=lld "-LIBPATH:C:/lib"'
            )

    def test_cflags_assemble_base_lto_computed_pgo(self):
        substs = {
            "MOZ_CARGO_CC_ENV_SUFFIX": "t",
            "MOZ_CARGO_HOST_CC_ENV_SUFFIX": "h",
            "MOZ_CARGO_CFLAGS_BASE": ["-base"],
            "MOZ_CARGO_CXXFLAGS_BASE": ["-xxbase"],
            "MOZ_CARGO_HOST_CFLAGS_BASE": ["-hbase"],
            "MOZ_CARGO_HOST_CXXFLAGS_BASE": ["-hxxbase"],
            "RUST_LTO_CFLAGS": ["-flto"],
            "RUST_PGO_CFLAGS": ["-fprofile-use=x"],
            "MOZ_CARGO_CFLAGS_FILTER": ["%"],
            "MOZ_CARGO_CXXFLAGS_FILTER": ["%"],
            "MOZ_CARGO_HOST_CFLAGS_FILTER": ["%"],
            "MOZ_CARGO_HOST_CXXFLAGS_FILTER": ["%"],
        }
        cmd = _cmd(
            computed_cflags=("-Icomputed",),
            computed_cxxflags=("-Ixxcomputed",),
            computed_host_cflags=("-Ihost",),
            computed_host_cxxflags=("-Ihostxx",),
        )
        env = _env(cmd, substs)
        self.assertEqual(env["CFLAGS_t"], "-base -flto -Icomputed -fprofile-use=x")
        self.assertEqual(
            env["CXXFLAGS_t"], "-xxbase -flto -Ixxcomputed -fprofile-use=x"
        )
        self.assertEqual(env["CFLAGS_h"], "-hbase -Ihost")
        self.assertEqual(env["CXXFLAGS_h"], "-hxxbase -Ihostxx")

    def test_base_only_cflags_keep_the_allowed_cxxflags(self):
        substs = {
            "MOZ_CARGO_CC_ENV_SUFFIX": "t",
            "MOZ_CARGO_HOST_CC_ENV_SUFFIX": "h",
            "MOZ_CARGO_CFLAGS_BASE": ["-base"],
            "MOZ_CARGO_CXXFLAGS_BASE": ["-xxbase"],
            "MOZ_CARGO_HOST_CFLAGS_BASE": ["-hbase"],
            "MOZ_CARGO_HOST_CXXFLAGS_BASE": ["-hxxbase"],
            "RUST_LTO_CFLAGS": ["-flto"],
            "RUST_PGO_CFLAGS": ["-fprofile-use=x"],
            "MOZ_CARGO_CFLAGS_FILTER": [],
            "MOZ_CARGO_CXXFLAGS_FILTER": [
                "-fno-aligned-new",
                "-fno-sized-deallocation",
            ],
            "MOZ_CARGO_HOST_CFLAGS_FILTER": [],
            "MOZ_CARGO_HOST_CXXFLAGS_FILTER": [],
        }
        cmd = _cmd(
            computed_cflags=("-Icomputed", "-fno-aligned-new"),
            computed_cxxflags=("-fno-sized-deallocation", "-Ixx", "-fno-aligned-new"),
            computed_host_cflags=("-Ihost",),
            computed_host_cxxflags=("-fno-aligned-new",),
        )
        env = _env(cmd, substs)
        self.assertEqual(env["CFLAGS_t"], "-base")
        self.assertEqual(
            env["CXXFLAGS_t"], "-xxbase -fno-sized-deallocation -fno-aligned-new"
        )
        self.assertEqual(env["CFLAGS_h"], "-hbase")
        self.assertEqual(env["CXXFLAGS_h"], "-hxxbase")

    def test_sanitizer_options_append_to_inherited_values(self):
        substs = {"MOZ_RUST_SANITIZER_OPTION_VARS": ["ASAN_OPTIONS", "UBSAN_OPTIONS"]}
        env = _env(_cmd(), substs, {"ASAN_OPTIONS": "detect_leaks=0"})
        self.assertEqual(env["ASAN_OPTIONS"], "detect_leaks=0:intercept_tls_get_addr=0")
        self.assertEqual(env["UBSAN_OPTIONS"], "intercept_tls_get_addr=0")
        self.assertNotIn("TSAN_OPTIONS", env)

    def test_coreaudio_sdk(self):
        substs = {
            "MOZ_RUST_COREAUDIO_SDK_PATH": "/sdk/iPhoneOS.sdk",
            "IPHONEOS_SDK_DIR": "/sdk/iPhoneOS.sdk",
        }
        env = _env(_cmd(), substs, {"PATH": "/usr/bin"})
        self.assertEqual(env["COREAUDIO_SDK_PATH"], "/sdk/iPhoneOS.sdk")
        self.assertEqual(env["IPHONEOS_SDK_DIR"], "/sdk/iPhoneOS.sdk")
        self.assertEqual(env["PATH"], "/usr/bin")
        env = _env(_cmd(), {}, {"PATH": "/usr/bin"})
        self.assertNotIn("COREAUDIO_SDK_PATH", env)
        self.assertNotIn("IPHONEOS_SDK_DIR", env)


class TestComposeMachCargo(unittest.TestCase):
    def _mach_argv(self, cmd, substs, subcommand, invocation=None, **kw):
        return compose_mach_cargo_argv(
            cmd, substs, invocation or CargoInvocation(), subcommand, **kw
        )

    def test_library_auto_args(self):
        cmd = _cmd(features=("f",))
        argv = self._mach_argv(
            cmd,
            _substs(
                MOZ_CARGO_DEFAULT_PROFILE_ARGS=["--release"],
                MOZ_CARGO_FROZEN_ARGS=["--frozen"],
            ),
            "check",
        )
        self.assertEqual(
            argv,
            [
                "cargo",
                "check",
                "--release",
                "--frozen",
                "--manifest-path",
                cmd.manifest_path,
                "--lib",
                "--target=x86_64-unknown-linux-gnu",
                "--features",
                "f,mozilla-central-workspace-hack",
            ],
        )

    def test_program_auto_args(self):
        cmd = _cmd(kind="program", names=("geckodriver",))
        argv = self._mach_argv(
            cmd, _substs(MOZ_CARGO_TARGET_ARGS=["--target=t"]), "clippy"
        )
        self.assertEqual(
            argv,
            [
                "cargo",
                "clippy",
                "--manifest-path",
                cmd.manifest_path,
                "--bin",
                "geckodriver",
                "--target=t",
                "--features",
                "mozilla-central-workspace-hack",
            ],
        )

    def test_host_program_auto_args_target_host(self):
        cmd = _cmd(kind="host-program", names=("geckodriver",))
        argv = self._mach_argv(
            cmd,
            {
                "CARGO": "cargo",
                "MOZ_CARGO_HOST_TARGET_ARGS": ["--target=x86_64-pc-host"],
            },
            "check",
        )
        self.assertEqual(
            argv,
            [
                "cargo",
                "check",
                "--manifest-path",
                cmd.manifest_path,
                "--bin",
                "geckodriver",
                "--target=x86_64-pc-host",
                "--features",
                "mozilla-central-workspace-hack",
            ],
        )

    def test_verbose_adds_vv(self):
        argv = self._mach_argv(
            _cmd(), {"CARGO": "cargo"}, "check", CargoInvocation(verbose=True)
        )
        self.assertIn("-vv", argv)

    def test_auto_args_can_be_dropped_without_a_build_flags_override(self):
        cmd = _cmd(features=("f",))
        argv = self._mach_argv(
            cmd,
            _substs(),
            "check",
            extra_cli_flags=("-p", "gkrust-shared", "--target=t"),
            jobs=4,
            auto_args=False,
        )
        self.assertEqual(
            argv,
            [
                "cargo",
                "check",
                "--manifest-path",
                cmd.manifest_path,
                "-j",
                "4",
                "-p",
                "gkrust-shared",
                "--target=t",
            ],
        )

    def test_build_flags_override_replaces_computed(self):
        argv = self._mach_argv(
            _cmd(features=("f",)),
            _substs(MOZ_CARGO_FROZEN_ARGS=["--frozen"]),
            "deny",
            build_flags_override=("check", "--hide-inclusion-graph"),
        )
        self.assertEqual(argv, ["cargo", "deny", "check", "--hide-inclusion-graph"])

    def test_extra_cli_flags_after_extra_flags(self):
        argv = self._mach_argv(
            _cmd(features=()),
            {"CARGO": "cargo"},
            "check",
            CargoInvocation(cargo_extra_flags=("--offline",)),
            extra_cli_flags=("--verbose",),
        )
        self.assertLess(argv.index("--offline"), argv.index("--verbose"))
        self.assertLess(argv.index("--verbose"), argv.index("--lib"))

    def test_extra_flags_keep_argument_boundaries(self):
        argv = self._mach_argv(
            _cmd(features=()),
            {"CARGO": "cargo"},
            "machete",
            CargoInvocation(cargo_extra_flags=("-f", "/src/my checkout/Cargo.lock")),
        )
        self.assertEqual(argv[argv.index("-f") + 1], "/src/my checkout/Cargo.lock")

    def test_jobs_added_for_build_like_only(self):
        cmd = _cmd(features=())
        argv = self._mach_argv(cmd, {"CARGO": "cargo"}, "check", jobs=4)
        self.assertEqual(argv[argv.index("-j") + 1], "4")
        plugin = self._mach_argv(
            cmd, {"CARGO": "cargo"}, "audit", build_flags_override=("check",), jobs=4
        )
        self.assertNotIn("-j", plugin)


if __name__ == "__main__":
    mozunit.main()
