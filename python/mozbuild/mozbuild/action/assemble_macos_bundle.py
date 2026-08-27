# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import shutil
import subprocess
import sys


def _rsync(source, dest, *extra):
    subprocess.run(["rsync", "-a", *extra, source, dest], check=True)


def _remove(path):
    if os.path.islink(path) or not os.path.isdir(path):
        os.remove(path)
    else:
        shutil.rmtree(path)


def main(argv):
    with open(argv[0], encoding="utf-8") as fh:
        spec = json.load(fh)

    bundle = spec["bundle"]
    contents = os.path.join(bundle, "Contents")
    macos = os.path.join(contents, "MacOS")
    resources = os.path.join(contents, "Resources")
    lproj = os.path.join(resources, spec["lproj"])

    if spec.get("stage"):
        shutil.rmtree(bundle, ignore_errors=True)
    os.makedirs(macos, exist_ok=True)

    if skeleton := spec.get("skeleton"):
        excludes = ["--exclude", "*.in"]
        english = None
        if spec["lproj"] != "English.lproj":
            excludes += ["--exclude", "English.lproj"]
            english = os.path.join(skeleton, "Resources", "English.lproj")
        _rsync(skeleton + "/", contents + "/", *excludes)
        if english and os.path.isdir(english):
            os.makedirs(lproj, exist_ok=True)
            _rsync(english + "/", lproj + "/", "--exclude", "*.in")

    if info_plist := spec.get("info_plist"):
        _rsync(info_plist, os.path.join(contents, "Info.plist"))

    if strings := spec.get("strings"):
        os.makedirs(lproj, exist_ok=True)
        _rsync(strings, os.path.join(lproj, "InfoPlist.strings"))

    if stage := spec.get("stage"):
        _rsync(stage + "/", resources + "/", "--exclude-from", spec["macos_files"])
        _rsync(
            stage + "/",
            macos + "/",
            "--include-from",
            spec["macos_files"],
            "--exclude",
            "*",
        )
        _rsync(
            stage + "/",
            macos + "/",
            "-L",
            "--include-from",
            spec["macos_copy_files"],
            "--exclude",
            "*",
        )

    for source, dest_rel in spec.get("binaries", []):
        dest = os.path.join(macos, dest_rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        _rsync(source, dest, "-L")

    for source, dest_rel in spec.get("extra_files", []):
        dest = os.path.join(contents, dest_rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        _rsync(source, dest, "-L")

    for src_name, dest_rel in spec.get("moves", []):
        source = os.path.join(resources, src_name)
        dest = os.path.join(contents, dest_rel)
        if os.path.lexists(source):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if os.path.lexists(dest):
                _remove(dest)
            shutil.move(source, dest)

    if pkginfo := spec.get("pkginfo"):
        with open(
            os.path.join(contents, "PkgInfo"), "w", encoding="utf-8", newline=""
        ) as fh:
            fh.write(pkginfo)

    for dest in spec.get("copies", []):
        os.makedirs(os.path.dirname(os.path.normpath(dest)), exist_ok=True)
        _rsync(bundle + "/", dest + "/", "--delete")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
