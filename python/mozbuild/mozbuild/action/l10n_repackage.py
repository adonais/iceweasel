# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Per-locale repackage action.

Re-packs the en-US dist as a single-locale package. Orchestrates:

1. Unpack the en-US package into <l10n_stage>/<pkg_dir>/
2. l10n-repack: swap localized parts in-place
3. macOS lproj rename: en.lproj to <lproj_root>.lproj for non-en
4. (opt) Windows helper.exe rebuild and copy into the staged tree's uninstall/
5. Package the staged tree via the package action
6. Move output to <output>

Invoked in make via $(call py_action,l10n_repackage,...).
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import buildconfig
from mozpack.packager import l10n as packager_l10n

from mozbuild.action import package as action_package

# Glob patterns excluded from resource and chrome repacking.
_NON_CHROME = frozenset((
    "dictionaries",
    "defaultagent_localized.ini",
    "defaults/profile",
    "defaults/pref*/*-l10n.js",
    "default.locale",
    "updater.ini",
    "extensions/langpack-*@*",
    "distribution/extensions/langpack-*@*",
    "**/multilocale.txt",
))


def l10n_repackage(
    locale: str,
    mach: Path,
    make: Path,
    l10n_stage: Path,
    unpack_distdir: Path,
    stagedist: Path,
    xpi_stage: Path,
    pkg_dir: str,
    pkg_format: str,
    pkg_filename: str,
    tar: Path,
    output: Path,
    moz_widget_toolkit: str,
    os_arch: str,
    installer_dir: Path | None,
    real_locale_mergedir: Path | None,
    extra_l10n: dict[str, str],
    non_resources: list[str],
    minify: bool,
    package_extra_args: list[str],
) -> int:
    is_cocoa = moz_widget_toolkit == "cocoa"
    is_winnt = os_arch == "WINNT"

    if result := _unpack(mach, l10n_stage, unpack_distdir):
        return result

    _do_l10n_repack(stagedist, xpi_stage, extra_l10n, non_resources, minify)

    renamed_lproj = _maybe_rename_lproj(stagedist, locale, is_cocoa)

    if is_winnt:
        if installer_dir is None:
            raise ValueError("--installer-dir is required on WINNT")
        if result := _build_helper_exe(
            make, installer_dir, locale, real_locale_mergedir, stagedist
        ):
            return result

    suffix = action_package.FORMAT_SUFFIX.get(pkg_format)
    if suffix is None:
        raise ValueError(f"Unknown package format: {pkg_format}")
    if not pkg_filename.endswith(suffix):
        raise ValueError(
            f"Package filename {pkg_filename} does not match format "
            f"{pkg_format} (expected suffix {suffix!r})"
        )
    basename = pkg_filename[: len(pkg_filename) - len(suffix)]
    result = action_package.main(
        [
            "--format",
            pkg_format,
            "--cwd",
            str(l10n_stage),
            "--pkg-dir",
            pkg_dir,
            "--basename",
            basename,
            "--tar",
            str(tar),
        ]
        + list(package_extra_args)
    )

    if result:
        return result

    if renamed_lproj is not None:
        renamed_lproj.rename(stagedist / "en.lproj")

    src = l10n_stage / pkg_filename
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(src, output)
    asc = src.with_name(src.name + ".asc")
    if asc.exists():
        shutil.move(asc, output.with_name(output.name + ".asc"))
    return 0


def _unpack(
    mach: Path,
    l10n_stage: Path,
    distdir: Path,
) -> int:
    shutil.rmtree(l10n_stage, ignore_errors=True)
    result = subprocess.run(
        [
            sys.executable,
            mach,
            "--log-no-times",
            "artifact",
            "install",
            "--unfiltered-project-package",
            "--distdir",
            distdir,
            "--verbose",
        ],
        check=False,
    )
    return result.returncode


def _do_l10n_repack(
    stagedist: Path,
    xpi_stage: Path,
    extra_l10n: dict[str, str],
    non_resources: list[str],
    minify: bool,
) -> None:
    # USE_ELF_HACK and PKG_STRIP are global build options. Force them
    # off so the in-process repack doesn't touch binaries.
    buildconfig.substs["USE_ELF_HACK"] = False
    buildconfig.substs["PKG_STRIP"] = False
    packager_l10n.repack(
        str(stagedist),
        str(xpi_stage),
        extra_l10n=extra_l10n,
        non_resources=non_resources,
        non_chrome=_NON_CHROME,
        minify=minify,
    )


def _lproj_root(locale: str, is_cocoa: bool) -> str:
    # macOS resolves an app's localized system resources by matching the
    # user's language to an <lang>.lproj dir. Since Yosemite a bare
    # "zh.lproj" reads as Simplified Chinese, so zh-TW uses "zh_TW"
    # (Apple's language_region convention) to keep Traditional strings.
    # See bug 1089363.
    if is_cocoa and locale == "zh-TW":
        return locale.replace("-", "_")
    return locale.split("-", 1)[0]


def _maybe_rename_lproj(
    stagedist: Path,
    locale: str,
    is_cocoa: bool,
) -> Path | None:
    # The en-US package ships its macOS system resources in en.lproj.
    # macOS resolves them by matching the directory name to the user's
    # language, so for a single non-en locale we rename the dir to that
    # locale's lproj name. en/en-US already have the right name, and
    # only macOS bundles have .lproj dirs at all.
    lproj = _lproj_root(locale, is_cocoa)
    if not (is_cocoa and lproj != "en"):
        return None
    en = stagedist / "en.lproj"
    if en.exists():
        renamed = stagedist / (lproj + ".lproj")
        en.rename(renamed)
        return renamed
    return None


def _build_helper_exe(
    make: Path,
    installer_dir: Path,
    locale: str,
    real_locale_mergedir: Path,
    stagedist: Path,
) -> int:
    # NSIS compilation isn't ported to Python yet, so shell out to make
    # for now. Porting it will move this to a py_action in a follow-up.
    env = {
        **os.environ,
        "AB_CD": locale,
        "REAL_LOCALE_MERGEDIR": str(real_locale_mergedir),
        "IS_LANGUAGE_REPACK": "1",
    }
    result = subprocess.run(
        [
            make,
            "-C",
            installer_dir,
            "CONFIG_DIR=l10ngen",
            "l10ngen/helper.exe",
        ],
        env=env,
        check=False,
    )
    if result.returncode:
        return result.returncode
    helper_src = installer_dir / "l10ngen" / "helper.exe"
    helper_dst = stagedist / "uninstall" / "helper.exe"
    helper_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(helper_src, helper_dst)
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Re-pack the en-US dist as a single-locale package."
    )
    parser.add_argument("--locale", required=True, help="The ab_cd locale code")
    parser.add_argument(
        "--mach",
        required=True,
        type=Path,
        help="Path to the topsrcdir mach executable",
    )
    parser.add_argument(
        "--make",
        required=True,
        type=Path,
        help="Path to the configured make binary (mozmake.exe on Windows). "
        "Used by the inner make invocation that builds NSIS helper.exe.",
    )
    parser.add_argument(
        "--l10n-stage",
        required=True,
        type=Path,
        help="L10n staging root, wiped and re-populated each run "
        "(typically <topobjdir>/dist/l10n-stage/)",
    )
    parser.add_argument(
        "--unpack-distdir",
        required=True,
        type=Path,
        help="Where to unpack the en-US package "
        "(typically <l10n-stage>/<MOZ_PKG_DIR>/)",
    )
    parser.add_argument(
        "--stagedist",
        required=True,
        type=Path,
        help="The staged dist subtree the repack/lproj/helper steps "
        "operate on (matches the legacy STAGEDIST variable)",
    )
    parser.add_argument(
        "--xpi-stage",
        required=True,
        type=Path,
        help="Per-locale staging dir from l10n_stage (typically "
        "<topobjdir>/dist/xpi-stage/locale-<ab_cd>/)",
    )
    parser.add_argument("--pkg-dir", required=True, help="MOZ_PKG_DIR")
    parser.add_argument("--pkg-format", required=True, help="MOZ_PKG_FORMAT")
    parser.add_argument(
        "--pkg-filename",
        required=True,
        help="Output filename written by the package action (relative to <l10n-stage>)",
    )
    parser.add_argument(
        "--tar", required=True, type=Path, help="Path to the tar binary"
    )
    parser.add_argument("--output", required=True, type=Path, help="Final package path")
    parser.add_argument("--moz-widget-toolkit", default="", help="MOZ_WIDGET_TOOLKIT")
    parser.add_argument("--os-arch", default="", help="OS_ARCH")
    parser.add_argument(
        "--installer-dir",
        type=Path,
        default=None,
        help="WINNT-only: directory of the inner installer make",
    )
    parser.add_argument(
        "--real-locale-mergedir",
        type=Path,
        default=None,
        help="WINNT-only: REAL_LOCALE_MERGEDIR for the inner make",
    )
    parser.add_argument(
        "--extra-l10n",
        action="append",
        default=[],
        help="BASE=PATH entries from MOZ_PKG_EXTRAL10N. Repeatable.",
    )
    parser.add_argument(
        "--non-resource",
        action="append",
        default=[],
        help="NON_OMNIJAR_FILES entries (used when MOZ_PACKAGER_FORMAT is "
        "omni). Repeatable.",
    )
    parser.add_argument(
        "--minify",
        action="store_true",
        help="Set when MOZ_PACKAGER_MINIFY is true",
    )
    # Any unrecognized argv tokens are forwarded verbatim to the package
    # action. This is how MOZ_PACKAGE_EXTRA_ARGS (--strong-compression,
    # --dsstore <path>, --app-name 'Firefox Developer Edition.app', etc.)
    # gets through with shell quoting intact. Repeatable --flag=value
    # forms can't preserve spaces inside values, but a positional list
    # the shell already split for us can.
    args, package_extra_args = parser.parse_known_args(argv)

    extra_l10n = dict(arg.split("=", 1) for arg in args.extra_l10n if "=" in arg)

    return l10n_repackage(
        locale=args.locale,
        mach=args.mach,
        make=args.make,
        l10n_stage=args.l10n_stage,
        unpack_distdir=args.unpack_distdir,
        stagedist=args.stagedist,
        xpi_stage=args.xpi_stage,
        pkg_dir=args.pkg_dir,
        pkg_format=args.pkg_format,
        pkg_filename=args.pkg_filename,
        tar=args.tar,
        output=args.output,
        moz_widget_toolkit=args.moz_widget_toolkit,
        os_arch=args.os_arch,
        installer_dir=args.installer_dir,
        real_locale_mergedir=args.real_locale_mergedir,
        extra_l10n=extra_l10n,
        non_resources=args.non_resource,
        minify=args.minify,
        package_extra_args=package_extra_args,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
