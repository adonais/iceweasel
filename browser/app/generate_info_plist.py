# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import re

import buildconfig
from mozbuild.preprocessor import Preprocessor
from variables import get_buildid


def _mac_bundle_version():
    # We want to build a version number that matches the format allowed for
    # CFBundleVersion (nnnnn[.nn[.nn]]). We'll incorporate both the version
    # number as well as the date, so that it changes at least daily (for nightly
    # builds), but also so that newly-built older versions (e.g. beta build) aren't
    # considered "newer" than previously-built newer versions (e.g. a trunk nightly)
    version = buildconfig.substs["MOZ_APP_VERSION"]
    buildid = get_buildid()
    majorVersion = re.match(r"^(\d+)[^\d].*", version).group(1)
    twodigityear = buildid[2:4]
    month = buildid[4:6].lstrip("0")
    day = buildid[6:8].lstrip("0")
    return f"{majorVersion}{twodigityear}.{month}.{day}"


def main(output, input_path, mac_app_name):
    substs = buildconfig.substs
    requirements = substs.get("MOZ_SMPRIVILEGEDEXECUTABLES_REQUIREMENTS") or ""
    pp = Preprocessor()
    pp.out = output
    pp.handleCommandLine(
        [
            "-Fsubstitution",
            f"-DAPP_VERSION={substs['MOZ_APP_VERSION']}",
            f"-DMOZ_APP_NAME={substs['MOZ_APP_NAME']}",
            f"-DMAC_APP_NAME={mac_app_name}",
            f"-DMOZ_MACBUNDLE_ID={substs['MOZ_MACBUNDLE_ID']}",
            f"-DMAC_BUNDLE_VERSION={_mac_bundle_version()}",
            f"-DMOZ_SMPRIVILEGEDEXECUTABLES_REQUIREMENTS={requirements}",
            f"-DMOZ_DEVELOPER_REPO_PATH={buildconfig.topsrcdir}",
            f"-DMOZ_DEVELOPER_OBJ_PATH={buildconfig.topobjdir}",
            input_path,
        ],
        True,
    )
    return set(pp.includes)
