#!/bin/bash
set -e -v

# This script is for building GN on Linux.

WORKSPACE=$HOME/workspace

# Build against the sysroot rather than the docker image's libraries, so that
# the resulting binary keeps working on older distros.
sysroot=$MOZ_FETCHES_DIR/sysroot
export CC=$MOZ_FETCHES_DIR/clang/bin/clang
export CXX=$MOZ_FETCHES_DIR/clang/bin/clang++
export CXXFLAGS="--sysroot=$sysroot"
export LDFLAGS="--sysroot=$sysroot -fuse-ld=lld -lrt"

cd $GECKO_PATH

. taskcluster/scripts/misc/build-gn-common.sh
