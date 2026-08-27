# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import glob
import os

config = {
    "log_name": "raptor",
    "title": os.uname()[1].lower().split(".")[0],
    "default_actions": [
        "clobber",
        "download-and-extract",
        "populate-webroot",
        "create-virtualenv",
        "start-emulator",
        "verify-device",
        "install-chrome-android",
        "install-chromium-android",
        "install-chromium-distribution",
        "install",
        "run-tests",
    ],
    "tooltool_cache": "/builds/tooltool_cache",
    "download_tooltool": True,
    "hostutils_manifest_path": "testing/config/tooltool-manifests/macosx64/hostutils.manifest",
    "device_serial": "emulator-5554",
    "sdk_dir_name": "android-sdk-macosx",
    "avds_dir_name": "android-device",
    "emulator_avd_name": "mozemulator-arm64",
    "emulator_process_name": "qemu-system-aarch64",
    "emulator_extra_args": [
        "-gpu",
        "swiftshader_indirect",
        "-skip-adb-auth",
        "-verbose",
        "-show-kernel",
        "-ranchu",
        "-selinux",
        "permissive",
        "-memory",
        "3072",
        "-cores",
        "4",
        "-skin",
        "800x1280",
        "-no-snapstorage",
        "-no-snapshot",
        "-prop",
        "ro.test_harness=true",
    ],
    "exes": {
        "adb": "%(abs_sdk_dir)s/platform-tools/adb",
    },
    "env": {
        "PATH": "%(PATH)s:%(abs_sdk_dir)s/emulator:%(abs_sdk_dir)s/tools:%(abs_sdk_dir)s/tools/bin:%(abs_sdk_dir)s/platform-tools",
    },
    "is_emulator": True,
}

os.environ["TOOLTOOLCACHE"] = config["tooltool_cache"]
os.environ["HOSTUTILS_MANIFEST_PATH"] = config["hostutils_manifest_path"]

_fetches_dir = os.environ.get("MOZ_FETCHES_DIR")
if _fetches_dir:
    os.environ["PATH"] += os.pathsep + os.path.join(
        _fetches_dir, config["sdk_dir_name"], "platform-tools"
    )

    for _cmdline_tools_bin in glob.glob(
        os.path.join(_fetches_dir, config["sdk_dir_name"], "cmdline-tools", "*", "bin")
    ):
        os.environ["PATH"] += os.pathsep + _cmdline_tools_bin

    for _jdk_home in glob.glob(
        os.path.join(_fetches_dir, "jdk", "*", "Contents", "Home")
    ):
        os.environ["JAVA_HOME"] = _jdk_home
        os.environ["PATH"] += os.pathsep + os.path.join(_jdk_home, "bin")
