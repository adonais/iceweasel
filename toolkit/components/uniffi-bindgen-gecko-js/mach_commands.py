# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import os
import subprocess
import sys
from enum import Enum

from mach.decorators import Command, CommandArgument, SubCommand

CPP_PATH = "toolkit/components/uniffi-js/GeneratedScaffolding.cpp"
JS_DIR = "toolkit/components/uniffi-bindgen-gecko-js/components/generated"
FIXTURE_JS_DIR = "toolkit/components/uniffi-bindgen-gecko-js/tests/generated"
DOCS_PATH = "docs/rust-components/api/js/"


"""Library to generate bindings from"""


class SourceLibrary(Enum):
    GKRUST_UNIFFI_COMPONENTS = "gkrust-uniffi-components"
    UNIFFI_BINDINGS_BINDGEN_TESTS = "uniffi-bindgen-gecko-js-test-fixtures"


def cargo_args_for_library(source_library):
    if source_library == SourceLibrary.GKRUST_UNIFFI_COMPONENTS:
        return []
    elif source_library == SourceLibrary.UNIFFI_BINDINGS_BINDGEN_TESTS:
        return ["--all-features"]
    raise ValueError(source_library)


def cargo_env_and_release_dir(command_context):
    """Environment and release directory for building the UniFFI cargo packages.

    Build into the objdir (via CARGO_TARGET_DIR) so the `mozbuild` crate's build
    script -- pulled into the graph through ohttp's `app-svc` feature -- can
    locate `config.status`, which it looks for among the ancestors of OUT_DIR.
    A plain `target/` in the source tree has no such ancestor, so the build
    would otherwise fail with `BUILDCONFIG_RS not defined`. This mirrors how the
    rest of the build system invokes cargo.
    """
    env = dict(os.environ)
    env["CARGO_TARGET_DIR"] = command_context.topobjdir
    return env, os.path.join(command_context.topobjdir, "release")


def build_gkrust_uniffi_library(command_context, source_library):
    uniffi_root = crate_root(command_context)
    print("Building gkrust-uniffi-components")
    cmdline = [
        "cargo",
        "build",
        "--release",
        "--manifest-path",
        os.path.join(command_context.topsrcdir, "Cargo.toml"),
        "--package",
        source_library.value,
    ] + cargo_args_for_library(source_library)
    print(cmdline)
    # nss_sys (via logins' keydb) and the mozbuild crate need an NSS library to
    # link against. Run [app-services-repo]libs/verify-desktop-environment.sh
    # to configure it (see bug 1981747 / D260481), or set MOZ_TOPOBJDIR to a
    # populated objdir. Warn here so a missing environment is easier to diagnose
    # than a raw link failure.
    if "NSS_DIR" not in os.environ and "MOZ_TOPOBJDIR" not in os.environ:
        print(
            "warning: NSS build environment not detected; building the UniFFI "
            + "library may fail to link against NSS. Run "
            + "[app-services-repo]libs/verify-desktop-environment.sh to "
            + "configure it.",
            file=sys.stderr,
        )
    env, out_dir = cargo_env_and_release_dir(command_context)
    subprocess.check_call(cmdline, cwd=uniffi_root, env=env)
    print()

    basename = format(source_library.value.replace("-", "_"))
    filename_candidates = [
        # Linux / Darwin
        f"lib{basename}.a",
        # Windows
        f"{basename}.lib",
        # Some other combinations, just in case
        f"{basename}.a",
        f"lib{basename}.lib",
    ]
    for filename in filename_candidates:
        candidate = os.path.join(out_dir, filename)
        if os.path.exists(candidate):
            return candidate
    raise Exception(f"Can't find gkrust_uniffi library in {out_dir}")


def build_uniffi_bindgen_gecko_js(command_context):
    uniffi_root = crate_root(command_context)
    print("Building uniffi-bindgen-gecko-js")
    cmdline = [
        "cargo",
        "build",
        "--release",
        "--manifest-path",
        os.path.join(command_context.topsrcdir, "Cargo.toml"),
        "--package",
        "uniffi-bindgen-gecko-js",
    ]
    env, release_dir = cargo_env_and_release_dir(command_context)
    subprocess.check_call(cmdline, cwd=uniffi_root, env=env)
    print()
    return os.path.join(release_dir, "uniffi-bindgen-gecko-js")


@Command(
    "uniffi",
    category="devenv",
    description="Generate JS bindings using uniffi-bindgen-gecko-js",
)
def uniffi(command_context, *runargs, **lintargs):
    """Run uniffi."""
    command_context._sub_mach(["help", "uniffi"])
    return 1


def crate_root(command_context):
    return os.path.join(
        command_context.topsrcdir, "toolkit", "components", "uniffi-bindgen-gecko-js"
    )


@SubCommand(
    "uniffi",
    "generate",
    description="Generate/regenerate bindings",
)
def generate_command(command_context):
    library_path = build_gkrust_uniffi_library(
        command_context,
        SourceLibrary.GKRUST_UNIFFI_COMPONENTS,
    )
    fixtures_library_path = build_gkrust_uniffi_library(
        command_context,
        SourceLibrary.UNIFFI_BINDINGS_BINDGEN_TESTS,
    )
    binary_path = build_uniffi_bindgen_gecko_js(command_context)
    cmdline = [
        binary_path,
        "--library-path",
        library_path,
        "--fixtures-library-path",
        fixtures_library_path,
        "generate",
        "--js-dir",
        JS_DIR,
        "--fixture-js-dir",
        FIXTURE_JS_DIR,
        "--cpp-path",
        CPP_PATH,
        "--docs-path",
        DOCS_PATH,
    ]
    subprocess.check_call(cmdline, cwd=command_context.topsrcdir)
    return 0


@SubCommand(
    "uniffi",
    "pipeline",
    description="Inspect UniFFI bindings pipeline",
)
@CommandArgument("args", nargs=argparse.REMAINDER)
def pipeline_command(command_context, args):
    library_path = build_gkrust_uniffi_library(
        command_context,
        SourceLibrary.GKRUST_UNIFFI_COMPONENTS,
    )
    fixtures_library_path = build_gkrust_uniffi_library(
        command_context,
        SourceLibrary.UNIFFI_BINDINGS_BINDGEN_TESTS,
    )
    binary_path = build_uniffi_bindgen_gecko_js(command_context)
    cmdline = [
        binary_path,
        "--library-path",
        library_path,
        "--fixtures-library-path",
        fixtures_library_path,
        "pipeline",
    ] + args
    subprocess.check_call(cmdline, cwd=command_context.topsrcdir)
    return 0
