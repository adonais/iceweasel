#!/bin/bash
set -x -e -v

# This script is for building libdmg-hfsplus to get the `dmg` and `hfsplus`
# tools for extracting DMG archives on macOS without mounting them.

MACOS_TARGET="$1"
. $GECKO_PATH/taskcluster/scripts/misc/macos-setup.sh

case "$MACOS_TARGET" in
    aarch64-apple-darwin) target_arch=arm64 ;;
    x86_64-apple-darwin) target_arch=x86_64 ;;
esac

WORKSPACE=$HOME/workspace
STAGE=$WORKSPACE/dmg

mkdir -p $UPLOAD_DIR $STAGE

cd $MOZ_FETCHES_DIR/libdmg-hfsplus

# The SDK has liblzma but not its headers, so take them from the xz source.
cmake \
  -DCMAKE_SYSTEM_NAME=Darwin \
  -DCMAKE_OSX_ARCHITECTURES=$target_arch \
  -DCMAKE_OSX_SYSROOT=$MACOS_SDK \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=$MACOSX_DEPLOYMENT_TARGET \
  -DCMAKE_C_COMPILER=$MACOS_CC \
  -DCMAKE_C_COMPILER_TARGET=$MACOS_TARGET \
  -DCMAKE_CXX_COMPILER=$MACOS_CXX \
  -DCMAKE_CXX_COMPILER_TARGET=$MACOS_TARGET \
  -DCMAKE_AR=$MACOS_AR \
  -DCMAKE_RANLIB=$MACOS_RANLIB \
  -DCMAKE_C_FLAGS="$MACOS_EXTRA_CFLAGS" \
  -DCMAKE_CXX_FLAGS="$MACOS_EXTRA_CFLAGS" \
  -DCMAKE_FIND_ROOT_PATH=$MACOS_SDK \
  -DCMAKE_FIND_ROOT_PATH_MODE_PROGRAM=NEVER \
  -DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=ONLY \
  -DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=ONLY \
  -DLIBLZMA_INCLUDE_DIR=$MOZ_FETCHES_DIR/xz-source/src/liblzma/api \
  -DCMAKE_BUILD_TYPE=Release \
  .

make VERBOSE=1 -j$(nproc)

# Assert that lzma decompression was built in, as shipped DMGs use it.
grep -q lzma_stream_buffer_decode dmg/dmg

cp dmg/dmg hfs/hfsplus $STAGE

# duplicate the functionality of taskcluster-lib-urls, but in bash..
queue_base="$TASKCLUSTER_ROOT_URL/api/queue/v1"

cat >$STAGE/README<<EOF
Source is available as a taskcluster artifact:
$queue_base/task/$(python3 -c 'import json, os; print("{task}/artifacts/{artifact}".format(**next(f for f in json.loads(os.environ["MOZ_FETCHES"]) if "dmg-hfsplus" in f["artifact"])))')
EOF
tar caf $UPLOAD_DIR/dmg.tar.zst -C $WORKSPACE `basename $STAGE`
