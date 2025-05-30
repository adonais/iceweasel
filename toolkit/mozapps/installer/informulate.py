#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Generate build info files for use by other tools.
# This script assumes it is being run in a Mozilla CI build.

from argparse import ArgumentParser
import datetime
import buildconfig
import json
import mozinfo
import os


def main():
    parser = ArgumentParser()
    parser.add_argument("output_json", help="Output JSON file")
    parser.add_argument("buildhub_json", help="Output buildhub JSON file")
    parser.add_argument("output_txt", help="Output text file")
    # TODO: Move package-name.mk variables into moz.configure.
    parser.add_argument("pkg_platform", help="Package platform identifier")
    parser.add_argument(
        "--no-download", action="store_true", help="Do not include download information"
    )
    parser.add_argument("--package", help="Path to application package file")
    parser.add_argument("--installer", help="Path to application installer file")
    args = parser.parse_args()
    mozinfo.find_and_update_from_json()

    important_substitutions = [
        "target",
        "host",
        "MOZ_UPDATE_CHANNEL",
        "MOZ_APP_VENDOR",
        "MOZ_APP_NAME",
        "MOZ_APP_VERSION",
        "MOZ_APP_MAXVERSION",
        "MOZ_APP_ID",
        "MOZ_SOURCE_REPO",
    ]
    other_substitutions = [
        "CC",
        "CXX",
        "AS",
    ]

    all_key_value_pairs = {
        x.lower(): buildconfig.substs[x] for x in important_substitutions
    }

    def stringify(x):
        if isinstance(x, (tuple, list)):
            return " ".join(x)
        return x or ""

    all_key_value_pairs.update(
        {x.lower(): stringify(buildconfig.substs.get(x)) for x in other_substitutions}
    )
    build_id = os.environ["MOZ_BUILD_DATE"]
    all_key_value_pairs.update(
        {
            "buildid": build_id,
            "moz_source_stamp": buildconfig.substs["MOZ_SOURCE_CHANGESET"],
            "moz_pkg_platform": args.pkg_platform,
        }
    )

    with open(args.output_json, "wt") as f:
        json.dump(all_key_value_pairs, f, indent=2, sort_keys=True)
        f.write("\n")

    with open(args.buildhub_json, "wt") as f:
        build_time = datetime.datetime.strptime(build_id, "%Y%m%d%H%M%S")
        s = buildconfig.substs
        record = {
            "build": {
                "id": build_id,
                "date": build_time.isoformat() + "Z",
                "as": all_key_value_pairs["as"],
                "cc": all_key_value_pairs["cc"],
                "cxx": all_key_value_pairs["cxx"],
                "host": s["host"],
                "target": s["target"],
            },
            "source": {
                "product": s["MOZ_APP_NAME"],
                "repository": s["MOZ_SOURCE_REPO"],
                "tree": os.environ["MH_BRANCH"],
                "revision": s["MOZ_SOURCE_CHANGESET"],
            },
            "target": {
                "platform": args.pkg_platform,
                "os": mozinfo.info["os"],
                # This would be easier if the locale was specified at configure time.
                "locale": os.environ.get("AB_CD", "en-US"),
                "version": s["MOZ_APP_VERSION_DISPLAY"] or s["MOZ_APP_VERSION"],
                "channel": s["MOZ_UPDATE_CHANNEL"],
            },
        }

        if args.no_download:
            package = None
        elif args.installer and os.path.exists(args.installer):
            package = args.installer
        else:
            package = args.package
        if package:
            st = os.stat(package)
            mtime = datetime.datetime.fromtimestamp(st.st_mtime)
            record["download"] = {
                # The release pipeline will update these keys.
                "url": os.path.basename(package),
                "mimetype": "application/octet-stream",
                "date": mtime.isoformat() + "Z",
                "size": st.st_size,
            }

        json.dump(record, f, indent=2, sort_keys=True)
        f.write("\n")

    with open(args.output_txt, "wt") as f:
        f.write("buildID={}\n".format(build_id))


if __name__ == "__main__":
    main()
