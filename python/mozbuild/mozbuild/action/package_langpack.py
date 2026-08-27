# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Per-locale langpack packaging action. Wraps `langpack_manifest`
and the `zip` action.

Invoked in make via $(call py_action,package_langpack,...).
"""

import argparse
import sys
from pathlib import Path

from mozbuild.action import langpack_manifest
from mozbuild.action import zip as action_zip


def package_langpack(
    locale: str,
    xpi_stage: str,
    metadata: str,
    output: str,
    eid: str,
    app_version: str,
    max_app_ver: str,
    app_name: str,
    l10n_basedir: str,
    includes: list[str],
) -> int:
    Path(output).parent.mkdir(parents=True, exist_ok=True)

    if result := langpack_manifest.main([
        "--locales",
        locale,
        "--app-version",
        app_version,
        "--max-app-ver",
        max_app_ver,
        "--app-name",
        app_name,
        "--l10n-basedir",
        l10n_basedir,
        "--metadata",
        metadata,
        "--langpack-eid",
        eid,
        "--input",
        xpi_stage,
    ]):
        return result

    return action_zip.main(
        [
            "-C",
            xpi_stage,
            "-x",
            "**/*.manifest",
            "-x",
            "**/*.js",
            "-x",
            "**/*.ini",
            output,
        ]
        + list(includes)
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Build a langpack .xpi for a single non-en-US locale."
    )
    parser.add_argument("--locale", required=True, help="The ab_cd locale code")
    parser.add_argument(
        "--xpi-stage",
        required=True,
        help="Staged xpi tree (input, typically <topobjdir>/dist/xpi-stage/locale-<ab_cd>/)",
    )
    parser.add_argument(
        "--metadata",
        required=True,
        help="Path to the langpack-metadata.ftl file",
    )
    parser.add_argument("--output", required=True, help="Output .xpi path")
    parser.add_argument(
        "--eid", required=True, help="MOZ_LANGPACK_EID for the resulting WebExtension"
    )
    parser.add_argument("--app-version", required=True, help="MOZ_APP_VERSION")
    parser.add_argument("--max-app-ver", required=True, help="MOZ_APP_MAXVERSION")
    parser.add_argument("--app-name", required=True, help="MOZ_APP_DISPLAYNAME")
    parser.add_argument("--l10n-basedir", required=True, help="L10NBASEDIR")
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="Files or directories from <xpi-stage> to include in the .xpi "
        "(e.g. chrome, localization, manifest.json). Repeatable.",
    )
    args = parser.parse_args(argv)

    return package_langpack(
        locale=args.locale,
        xpi_stage=args.xpi_stage,
        metadata=args.metadata,
        output=args.output,
        eid=args.eid,
        app_version=args.app_version,
        max_app_ver=args.max_app_ver,
        app_name=args.app_name,
        l10n_basedir=args.l10n_basedir,
        includes=args.include,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
