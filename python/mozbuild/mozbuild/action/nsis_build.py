# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Run makensis for a staged Windows installer."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def nsis_build(
    config_dir: Path,
    nsi: str,
    makensis: str,
    makensis_flags: list[str],
    output: str,
    buildid_header: Path | None = None,
) -> int:
    out = Path(output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.unlink(missing_ok=True)
    flags = list(makensis_flags)
    if buildid_header:
        _define, _name, buildid = buildid_header.read_text(encoding="utf-8").split()
        flags.append(f"-DMOZ_BUILDID={buildid}")
    # An OutFile given after the script overrides the script's own. Given
    # before it, the script's wins.
    if result := subprocess.run(
        [makensis] + flags + [nsi, f'-XOutFile "{out}"'],
        cwd=config_dir,
        check=False,
    ).returncode:
        return result

    if not out.exists():
        print(f"{nsi}: makensis did not write {out}", file=sys.stderr)
        return 1

    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run makensis on an .nsi script in a staged CONFIG_DIR."
    )
    parser.add_argument(
        "--config-dir",
        required=True,
        type=Path,
        metavar="CONFIG_DIR",
        help="Staged directory to run makensis in",
    )
    parser.add_argument("--nsi", required=True, help="The .nsi script to compile")
    parser.add_argument("--makensis", required=True, help="MAKENSISU")
    parser.add_argument(
        "--makensis-flag",
        action="append",
        default=[],
        dest="makensis_flags",
        help="A flag to pass to makensis (e.g. -nocd). Repeatable.",
    )
    parser.add_argument(
        "--output",
        help="Path makensis writes the exe to. The generate entry point uses "
        "the output it is given and ignores this.",
    )
    parser.add_argument(
        "--buildid-header",
        type=Path,
        metavar="BUILDID_H",
        help="buildid.h whose MOZ_BUILDID is passed to makensis as a define",
    )
    return parser


def main(argv: list[str]) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if not args.output:
        parser.error("--output is required")

    return nsis_build(
        config_dir=args.config_dir,
        nsi=args.nsi,
        makensis=args.makensis,
        makensis_flags=args.makensis_flags,
        output=args.output,
        buildid_header=args.buildid_header,
    )


def generate(output, *argv: str) -> int:
    output.avoid_writing_to_file()
    args = _parser().parse_args([*argv])
    return nsis_build(
        config_dir=args.config_dir,
        nsi=args.nsi,
        makensis=args.makensis,
        makensis_flags=args.makensis_flags,
        output=output.name,
        buildid_header=args.buildid_header,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
