# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import sys
from pathlib import Path

import buildconfig
from mozpack.copier import Jarrer
from mozpack.files import File

from mozbuild.nss_libs import nss_link_dylibs


def expected_libs(substs, defines):
    libs = ["megazord"]
    libs.extend(nss_link_dylibs(substs, defines))

    if substs.get("OS_TARGET") == "Linux":
        libs.append("freeblpriv3")

    libs.extend(["freebl3", "softokn3"])

    return libs


def main(argv):
    parser = argparse.ArgumentParser(
        description="Package libmegazord and its NSS runtime deps into a zip archive."
    )
    parser.add_argument(
        "--dist-bin",
        required=True,
        help="Source directory containing the shared libraries (typically dist/bin).",
    )
    parser.add_argument("output", help="Path to the zip archive to write.")
    args = parser.parse_args(argv)

    substs = buildconfig.substs
    defines = buildconfig.defines
    dll_prefix = substs.get("DLL_PREFIX", "")
    dll_suffix = substs.get("DLL_SUFFIX", "")

    dist_bin = Path(args.dist_bin)
    files_to_zip = []
    missing = []
    for lib in expected_libs(substs, defines):
        filename = f"{dll_prefix}{lib}{dll_suffix}"
        path = dist_bin / filename
        if path.is_file():
            files_to_zip.append((filename, path))
        else:
            missing.append(path)

    if missing:
        print(
            f"error: {len(missing)} expected libmegazord runtime dep(s) not found:",
            file=sys.stderr,
        )
        for path in missing:
            print(f"  {path}", file=sys.stderr)
        print(
            "Check the megazord USE_LIBS in "
            "third_party/application-services/megazords/full/moz.build and the "
            "expected_libs list (mozbuild/nss_libs.py and this file) for drift.",
            file=sys.stderr,
        )
        return 1

    jarrer = Jarrer()
    for name, path in files_to_zip:
        jarrer.add(name, File(str(path)))
    jarrer.copy(args.output)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
