#!/bin/bash
set -x -e -v

# This script is for fetching and repacking the Android system images (for macOS)

AVD_JSON_CONFIG="$1"

mkdir -p $UPLOAD_DIR

rm -rf /builds/worker/.mozbuild/jdk
cp -rp $MOZ_FETCHES_DIR/jdk /builds/worker/.mozbuild/

# Populate /builds/worker/.mozbuild/android-sdk-linux.
cd $GECKO_PATH
./mach python python/mozboot/mozboot/android.py --artifact-mode --system-images-only --avd-manifest="$AVD_JSON_CONFIG" --no-interactive --list-packages

mv /builds/worker/.mozbuild/android-sdk-linux /builds/worker/.mozbuild/android-sdk-macosx

tar cavf $UPLOAD_DIR/android-system-images-macos.tar.zst -C /builds/worker/.mozbuild android-sdk-macosx/system-images

ls -al $UPLOAD_DIR
