#!/bin/bash
set -x -e -v

# This script is for fetching and repacking the Android AVD (for macOS)

AVD_JSON_CONFIG="$1"

mkdir -p $UPLOAD_DIR

rm -rf /builds/worker/.mozbuild/jdk
cp -rp $MOZ_FETCHES_DIR/jdk /builds/worker/.mozbuild/

# Populate /builds/worker/.mozbuild/android-device
cd $GECKO_PATH
./mach python python/mozboot/mozboot/android.py --artifact-mode --prewarm-avd --avd-manifest="$AVD_JSON_CONFIG" --no-interactive --list-packages

tar cavf $UPLOAD_DIR/android-avd-macos.tar.zst -C /builds/worker/.mozbuild android-device

ls -al $UPLOAD_DIR
