#!/bin/bash
set -x -e -v

# This script is for building 7-zip.
PROJECT=7zz

cd ${MOZ_FETCHES_DIR}/${PROJECT}

if [[ $(uname -o) == "Msys" ]]; then
    SUFFIX=".exe"
    BUILD_DIR=x64
    . "$GECKO_PATH/taskcluster/scripts/misc/vs-setup.sh"
    pushd CPP/7zip/Bundles/Alone2
    nmake PLATFORM=x64 -f makefile
    popd
else
    SUFFIX=""
    BUILD_DIR=b/c
    export PATH="$MOZ_FETCHES_DIR/clang/bin:$PATH"
    # Replace CR/LF line endings with Unix LF endings
    find . -name "*.mak" -exec sed -i 's/\r$//' {} \;
    pushd CPP/7zip/Bundles/Alone2
    make -f ../../cmpl_clang.mak MY_ARCH="--sysroot=$MOZ_FETCHES_DIR/sysroot-x86_64-linux-gnu" LDFLAGS_STATIC_3=-fuse-ld=lld
    popd
fi

mkdir ${PROJECT}
mv CPP/7zip/Bundles/Alone2/${BUILD_DIR}/${PROJECT}${SUFFIX} ${PROJECT}/${PROJECT}${SUFFIX}

tar -acf ${PROJECT}.tar.zst ${PROJECT}

mkdir -p $UPLOAD_DIR
mv ${PROJECT}.tar.zst $UPLOAD_DIR
