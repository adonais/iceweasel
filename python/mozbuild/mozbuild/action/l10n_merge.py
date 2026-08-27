# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Per-locale merge action.

Builds <target>/<ab_cd>/ (e.g. <topobjdir>/<reldir>/merge-dir/<ab_cd>/)
from <l10n-base>/<ab_cd>/. Wraps python -m moz.l10n.bin.build and
copies hunspell dictionaries that moz.l10n doesn't handle.

Invoked in make via $(call py_action,l10n_merge,...).
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def merge_locale(
    locale: str,
    config: str,
    l10n_base: str,
    target: str,
) -> int:
    merge_dir = Path(target) / locale
    if merge_dir.exists():
        shutil.rmtree(merge_dir)
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "moz.l10n.bin.build",
            "--config",
            config,
            "--base",
            l10n_base,
            "--target",
            target,
            "--locales",
            locale,
            "--coverage",
        ],
        check=False,
    )
    if result.returncode:
        return result.returncode

    hunspell_rel = Path("extensions") / "spellcheck" / "hunspell"
    spellcheck_src = Path(l10n_base) / locale / hunspell_rel
    if spellcheck_src.is_dir():
        spellcheck_dst = merge_dir / hunspell_rel
        spellcheck_dst.mkdir(parents=True, exist_ok=True)
        for entry in spellcheck_src.iterdir():
            if entry.is_file():
                shutil.copy2(entry, spellcheck_dst / entry.name)
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Build the per-locale merge tree for a single locale."
    )
    parser.add_argument("--locale", required=True, help="The ab_cd locale code")
    parser.add_argument(
        "--config",
        required=True,
        help="Path to the app's l10n.toml (e.g. browser/locales/l10n.toml)",
    )
    parser.add_argument(
        "--l10n-base",
        required=True,
        help="L10NBASEDIR (the locale source repo)",
    )
    parser.add_argument(
        "--target",
        required=True,
        help="Output merge root (e.g. <topobjdir>/<reldir>/merge-dir/)",
    )
    args = parser.parse_args(argv)

    return merge_locale(
        locale=args.locale,
        config=args.config,
        l10n_base=args.l10n_base,
        target=args.target,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
