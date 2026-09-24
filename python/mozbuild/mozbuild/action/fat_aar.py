# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Fetch and unpack architecture-specific Maven zips, verify cross-architecture
compatibility, and ready inputs to an Android multi-architecture fat AAR build.
"""

import argparse
import subprocess
import sys
import time
from collections import defaultdict
from hashlib import sha1  # We don't need a strong hash to compare inputs.
from io import BytesIO
from zipfile import ZipFile

import buildconfig
import mozpack.path as mozpath
from mozpack.copier import FileCopier
from mozpack.files import JarFinder
from mozpack.mozjar import JarReader
from mozpack.packager.unpack import UnpackFinder


def print_copy_result(elapsed, destdir, result):
    print(
        f"Elapsed: {elapsed:.2f}s; From {destdir}: "
        f"Kept {result.existing_files_count} existing; "
        f"Added/updated {result.updated_files_count}; "
        f"Removed {result.removed_files_count} files "
        f"and {result.removed_directories_count} directories."
    )


def _artifact_job(arch, appservices_in_tree):
    # The mapping from Android CPU architecture (as required for the
    # Android-Gradle plugin) to TC job is defined here, and the TC index lookup
    # is mediated by python/mozbuild/mozbuild/artifacts.py and
    # python/mozbuild/mozbuild/artifact_builds.py.
    #
    # Ditto for the mapping from Desktop CPU architecture (as required for JNA)
    # to TC job.
    jobs = {
        "arm64-v8a": "android-aarch64-opt",
        "armeabi-v7a": "android-arm-opt",
        "x86_64": "android-x86_64-opt",
        "darwin-aarch64": "macosx64-aarch64-opt",
        "darwin-x86-64": "macosx64-opt",
        "linux-x86-64": "linux64-opt",
        "linux-aarch64": "linux64-aarch64-opt",
        "win32-x86-64": "win64-opt",
        "win32-aarch64": "win64-aarch64-opt",
    }

    job = jobs[arch]
    if appservices_in_tree and job.startswith("android-"):
        # An in-tree app-services changes what the megazord contains, so the
        # duplicated build is the one to take the AAR from.
        job = job.replace("-opt", "-appservices-opt")
    return job


def _download_zip(distdir, arch, artifact_filter):
    job = _artifact_job(arch, buildconfig.substs.get("MOZ_APPSERVICES_IN_TREE"))

    dest = mozpath.join(distdir, "input", arch)
    subprocess.check_call([
        sys.executable,
        mozpath.join(buildconfig.topsrcdir, "mach"),
        "artifact",
        "install",
        "--job",
        job,
        "--distdir",
        dest,
        "--no-tests",
        "--no-process",
        "--artifact-filter",
        artifact_filter,
    ])
    return mozpath.join(dest, mozpath.basename(artifact_filter))


def fat_aar(
    distdir,
    android_zip_paths,
    desktop_zip_paths=None,
    no_process=False,
    no_compatibility_check=False,
    verbose=False,
):
    desktop_zip_paths = desktop_zip_paths or {}
    if no_process:
        print("Not processing architecture-specific artifact Maven AARs.")
        return 0

    start = time.monotonic()

    # Map {filename: {fingerprint: [arch1, arch2, ...]}}.
    diffs = defaultdict(lambda: defaultdict(list))
    missing_arch_prefs = set()
    # Collect multi-architecture inputs to the fat AAR.
    copier = FileCopier()

    for arch, android_zip_path in android_zip_paths.items():
        zip_path = android_zip_path or _download_zip(
            distdir, arch, "public/build/target.maven.zip"
        )
        if verbose:
            print(f"Processing '{zip_path}' for architecture {arch}")
        # Map old non-architecture-specific path to new architecture-specific path.
        old_rewrite_map = {
            "greprefs.js": f"{arch}/greprefs.js",
            "defaults/pref/geckoview-prefs.js": f"defaults/pref/{arch}/geckoview-prefs.js",
        }

        # Architecture-specific preferences files.
        arch_prefs = set(old_rewrite_map.values())
        missing_arch_prefs |= set(arch_prefs)

        known_aars = {
            "geckoview": (
                lambda path: mozpath.match(
                    path, "**/org/mozilla/geckoview/**/geckoview-*.aar"
                ),
                "geckoview",
            ),
            "full-megazord": (
                lambda path: mozpath.match(
                    path,
                    "**/org/mozilla/appservices/**/full-megazord/**/full-megazord-*.aar",
                ),
                "appservices",
            ),
        }

        expected_keys = {"geckoview"}
        if buildconfig.substs.get("MOZ_APPSERVICES_IN_TREE"):
            expected_keys.add("full-megazord")

        aars = []
        for path, file in JarFinder(zip_path, JarReader(zip_path)):
            for key, (predicate, prefix) in known_aars.items():
                if predicate(path):
                    aars.append((key, path, file, prefix))

        for expected_key in sorted(expected_keys):
            found = sorted(p for key, p, _, _ in aars if key == expected_key)
            if len(found) != 1:
                raise ValueError(
                    f'Maven zip "{zip_path}" with {len(found)} candidate '
                    f"{expected_key} AARs found: {found}"
                )

        for key, aar_path, aar_file, aar_prefix in aars:
            if verbose:
                print(
                    f"Processing '{key}' AAR '{aar_path}' for Android architecture {arch}"
                )

            jar_finder = JarFinder(
                aar_file.file.filename, JarReader(fileobj=aar_file.open())
            )
            for path, fileobj in UnpackFinder(jar_finder):
                path_with_prefix = mozpath.join(aar_prefix, path)

                # Native libraries go straight through.
                if mozpath.match(path, "jni/**"):
                    copier.add(path_with_prefix, fileobj)

                elif key == "geckoview" and path in arch_prefs:
                    copier.add(path_with_prefix, fileobj)

                elif path in ("classes.jar", "annotations.zip"):
                    # annotations.zip differs due to timestamps, but the contents should not.

                    # `JarReader` fails on the non-standard `classes.jar` produced by Gradle/aapt,
                    # and it's not worth working around, so we use Python's zip functionality
                    # instead.
                    z = ZipFile(BytesIO(fileobj.open().read()))
                    for r in z.namelist():
                        fingerprint = sha1(z.open(r).read()).hexdigest()
                        diffs[f"{path_with_prefix}!/{r}"][fingerprint].append(arch)

                else:
                    fingerprint = sha1(fileobj.open().read()).hexdigest()
                    # There's no need to distinguish `target.maven.zip` from `assets/omni.ja` here,
                    # since in practice they will never overlap.
                    diffs[f"{path_with_prefix}"][fingerprint].append(arch)

                if key == "geckoview":
                    missing_arch_prefs.discard(path)

    # Some differences are allowed across the architecture-specific AARs.  We could allow-list
    # the actual content, but it's not necessary right now.
    allow_pattern_list = {
        "geckoview/AndroidManifest.xml",  # Min SDK version is different for 32- and 64-bit builds.
        "geckoview/classes.jar!/org/mozilla/gecko/util/HardwareUtils.class",  # Min SDK as well.
        "geckoview/classes.jar!/org/mozilla/geckoview/BuildConfig.class",
        # Each input captures its CPU architecture.
        "geckoview/chrome/toolkit/content/global/buildconfig.html",
        # Bug 1556162: localized resources are not deterministic across
        # per-architecture builds triggered from the same push.
        "geckoview/**/*.ftl",
        "geckoview/**/*.dtd",
        "geckoview/**/*.properties",
        "appservices/AndroidManifest.xml",
        "appservices/classes.jar!/org/mozilla/appservices/**/BuildConfig.class",
    }

    not_allowed = {}

    def format_diffs(ds):
        # Like '  armeabi-v7a, arm64-v8a -> XXX\n  x86_64 -> YYY'.
        return "\n".join(
            sorted(
                "  {archs} -> {fingerprint}".format(
                    archs=", ".join(sorted(archs)), fingerprint=fingerprint
                )
                for fingerprint, archs in ds.items()
            )
        )

    for p, ds in sorted(diffs.items()):
        if len(ds) <= 1:
            # Only one hash across all inputs: roll on.
            continue

        if any(mozpath.match(p, pat) for pat in allow_pattern_list):
            print(
                f'Allowed: Path "{p}" has architecture-specific versions:\n{format_diffs(ds)}'
            )
            continue

        not_allowed[p] = ds

    for p, ds in not_allowed.items():
        print(
            f'Disallowed: Path "{p}" has architecture-specific versions:\n{format_diffs(ds)}'
        )

    for missing in sorted(missing_arch_prefs):
        print(
            f"Disallowed: Inputs missing expected architecture-specific input: {missing}"
        )

    if not no_compatibility_check and (missing_arch_prefs or not_allowed):
        return 1

    # Process Desktop artifacts, if requested.
    for arch, desktop_zip_path in desktop_zip_paths.items():
        if not desktop_zip_path:
            print(
                f"Disallowed: no archive was provided for Desktop architecture "
                f"{arch}; Desktop app-services archives must be supplied "
                "explicitly."
            )
            return 1

        zip_path = desktop_zip_path
        if verbose:
            print(f"Processing '{zip_path}' for Desktop architecture {arch}")

        for path, file in JarFinder(zip_path, JarReader(zip_path)):
            copier.add(mozpath.join("desktop", "resources", arch, path), file)

    output_dir = mozpath.join(distdir, "output")
    result = copier.copy(output_dir)

    if verbose:
        print_copy_result(
            time.monotonic() - start,
            output_dir,
            result,
        )

    return 0


_ALL_ARCHS = ("armeabi-v7a", "arm64-v8a", "x86_64")


_ALL_DESKTOP_ARCHS = (
    "darwin-aarch64",
    "darwin-x86-64",
    "linux-x86-64",
    "linux-aarch64",
    "win32-x86-64",
    "win32-aarch64",
)


def main(argv):
    description = """Fetch and unpack architecture-specific Maven zips, verify cross-architecture
compatibility, and ready inputs to an Android multi-architecture fat AAR build."""

    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--android-architectures",
        metavar="android-arch",
        nargs="+",
        choices=_ALL_ARCHS,
        required=True,
    )
    parser.add_argument(
        "--desktop-architectures",
        metavar="desktop-arch",
        nargs="*",
        choices=_ALL_DESKTOP_ARCHS,
        default=[],
    )
    parser.add_argument(
        "--no-process", action="store_true", help="Do not process Maven AARs."
    )
    parser.add_argument(
        "--no-compatibility-check",
        action="store_true",
        help="Do not fail if Maven AARs are not compatible.",
    )
    parser.add_argument("--distdir", required=True)
    parser.add_argument("--verbose", "-v", action="store_true", default=False)

    for arch in (*_ALL_ARCHS, *_ALL_DESKTOP_ARCHS):
        command_line_flag = arch.replace("_", "-")
        parser.add_argument(f"--{command_line_flag}", dest=arch)

    args = parser.parse_args(argv)
    args_dict = vars(args)

    android_zip_paths = {
        arch: args_dict.get(arch) for arch in args.android_architectures
    }

    if not android_zip_paths:
        raise ValueError("You must provide at least one Android Maven zip!")

    desktop_zip_paths = {
        arch: args_dict.get(arch) for arch in args.desktop_architectures
    }

    return fat_aar(
        args.distdir,
        android_zip_paths,
        desktop_zip_paths,
        no_process=args.no_process,
        no_compatibility_check=args.no_compatibility_check,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
