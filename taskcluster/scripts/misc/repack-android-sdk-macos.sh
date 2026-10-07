#!/bin/bash
set -x -e -v

# This script is for fetching and repacking the Android SDK (for macOS),
# the tools required to produce Android packages.

mkdir -p $UPLOAD_DIR

rm -rf /builds/worker/.mozbuild/jdk
cp -rp $MOZ_FETCHES_DIR/jdk /builds/worker/.mozbuild/

export REPO_OS_OVERRIDE=macosx_arm64

# Populate /builds/worker/.mozbuild/android-sdk-linux.
cd $GECKO_PATH
./mach python python/mozboot/mozboot/android.py --artifact-mode --no-interactive --list-packages

mv /builds/worker/.mozbuild/android-sdk-linux /builds/worker/.mozbuild/android-sdk-macosx

tar cavf $UPLOAD_DIR/android-sdk-macos.tar.zst -C /builds/worker/.mozbuild android-sdk-macosx bundletool.jar

ls -al $UPLOAD_DIR
