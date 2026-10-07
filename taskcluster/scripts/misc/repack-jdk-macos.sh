#!/bin/bash
set -x -e -v

# This script is for fetching and repacking the OpenJDK (for macOS)

mkdir -p $UPLOAD_DIR

# Populate /builds/worker/.mozbuild/jdk
cd $GECKO_PATH
./mach python python/mozboot/mozboot/android.py --jdk-only --os-name macosx --os-arch arm64

tar cavf $UPLOAD_DIR/jdk-macos.tar.zst -C /builds/worker/.mozbuild jdk

ls -al $UPLOAD_DIR
