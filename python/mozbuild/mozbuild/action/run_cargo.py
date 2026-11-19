# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Run Cargo for one serialized Rust build edge."""

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

from mozfile import json
from mozshellutil import quote as shell_quote

from mozbuild.rust_commands import (
    CargoInvocation,
    applies_library_lto,
    compose_cargo_build_edge_argv,
    compose_env,
    load_cargo_spec,
)


def workspace_packages(manifest_path, substs, topobjdir):
    """Map each workspace member's name to its ``cargo metadata`` entry."""
    output = subprocess.check_output(
        [
            substs.get("CARGO"),
            "metadata",
            "--no-deps",
            *substs.get("MOZ_CARGO_FROZEN_ARGS"),
            "--format-version",
            "1",
            "--manifest-path",
            manifest_path,
        ],
        cwd=topobjdir,
    )
    return {package["name"]: package for package in json.loads(output)["packages"]}


def narrow_test_edge(command, crates, packages):
    """Return the Cargo test edge command narrowed to ``crates``, and whether
    to enable ``mozilla-central-workspace-hack``.

    ``command`` is a directory's Cargo test edge command, which runs
    ``cargo test -p A -p B ... --features F,G`` for every crate in its
    ``RUST_TESTS``. ``crates`` are the edge's crates that were selected for
    testing. ``packages`` maps each workspace member's name to its
    ``cargo metadata`` entry.

    We remove the two kinds of feature Cargo rejects.

    - A plain feature that none of the ``-p`` packages declares.
    - A ``dep/feature`` whose ``dep`` is neither one of those packages nor one
      of their direct dependencies.

    A listed crate without tests keeps its ``-p``. ``gkrust`` is in
    ``RUST_TESTS`` only so that Cargo accepts ``gkrust_features``, and
    removing its ``-p`` would filter those features out too.
    """
    names = list(crates) + [
        name
        for name in command.names
        if name not in crates
        and name in packages
        and not any(t["test"] or t["doctest"] for t in packages[name]["targets"])
    ]

    selected = [packages[name] for name in names if name in packages]
    declared_features = {f for package in selected for f in package["features"]}
    feature_owners = set(names) | {
        dependency.get("rename") or dependency["name"]
        for package in selected
        for dependency in package["dependencies"]
    }

    def accepted(feature):
        owner, slash, _ = feature.partition("/")
        return owner in feature_owners if slash else feature in declared_features

    narrowed = replace(
        command,
        names=tuple(names),
        features=tuple(f for f in command.features if accepted(f)),
    )
    return narrowed, "mozilla-central-workspace-hack" in declared_features


def check_networking(command, substs, topobjdir):
    # When we are building in --enable-release mode; we add an additional check to confirm
    # that we are not importing any networking-related functions in rust code. This reduces
    # the chance of proxy bypasses originating from rust code.
    # The check only works when rust code is built with -Clto but without MOZ_LTO_RUST_CROSS.
    # Sanitizers and sancov also fail because compiler-rt hooks network functions.
    if (
        substs.get("OS_ARCH") != "Linux"
        or substs.get("MOZ_PROFILE_GENERATE")
        or substs.get("RUST_SANCOV_FLAGS")
        or substs.get("MOZ_ASAN")
        or substs.get("MOZ_TSAN")
        or substs.get("MOZ_UBSAN")
        or substs.get("MOZ_LTO_RUST_CROSS")
        or not applies_library_lto(command.kind, command.lto, substs)
    ):
        return 0
    from mozbuild.action import check_binary

    return check_binary.main(["--networking", str(Path(topobjdir, command.outputs[0]))])


def copy_program_pdbs(command, topobjdir):
    for output in command.outputs:
        program = Path(topobjdir, output)
        crate_pdb = program.with_name(program.stem.replace("-", "_") + ".pdb")
        program_pdb = program.with_suffix(".pdb")
        if crate_pdb == program_pdb or not crate_pdb.exists():
            continue
        if (
            program_pdb.exists()
            and program_pdb.stat().st_mtime >= crate_pdb.stat().st_mtime
        ):
            continue
        shutil.copyfile(crate_pdb, program_pdb)


def main(argv):
    parser = argparse.ArgumentParser(
        description="Compose and run Cargo for a Rust build edge."
    )
    parser.add_argument(
        "--spec",
        required=True,
        type=Path,
        help="Path to the Cargo command spec of the Rust build edge to run.",
    )
    # These flags vary per invocation and are not stored in the edge spec.
    parser.add_argument(
        "--timings", action="store_true", help="Pass --timings to Cargo."
    )
    parser.add_argument(
        "--keep-going", action="store_true", help="Pass --keep-going to Cargo."
    )
    parser.add_argument(
        "--single-job", action="store_true", help="Limit Cargo to one job."
    )
    args = parser.parse_args(argv)

    command, substs, topsrcdir, topobjdir = load_cargo_spec(
        json.loads(args.spec.read_text(encoding="utf-8"))
    )

    invocation = CargoInvocation.from_environ(os.environ)
    workspace_hack = True
    if command.kind == "test" and invocation.test_crates:
        crates = [name for name in command.names if name in invocation.test_crates]
        if not crates:
            return 0
        packages = workspace_packages(command.manifest_path, substs, topobjdir)
        command, workspace_hack = narrow_test_edge(command, crates, packages)

    env = compose_env(command, substs, os.environ, invocation, topsrcdir, topobjdir)
    cargo_argv = compose_cargo_build_edge_argv(
        command,
        substs,
        invocation,
        timings=args.timings,
        keep_going=args.keep_going,
        single_job=args.single_job,
        workspace_hack=workspace_hack,
    )
    if invocation.verbose:
        print(shell_quote(*cargo_argv), flush=True)

    # Keep jobserver file descriptors open for Cargo.
    returncode = subprocess.run(
        cargo_argv,
        env=env,
        cwd=command.working_directory,
        close_fds=False,
        check=False,
    ).returncode
    if returncode == 0:
        copy_program_pdbs(command, topobjdir)
        returncode = check_networking(command, substs, topobjdir)
    return returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
