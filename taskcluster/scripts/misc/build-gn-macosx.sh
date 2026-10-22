#!/bin/bash
set -e -v

# This script is for building GN for macOS.

WORKSPACE=$HOME/workspace

# The target triple selects the CPU architecture of the resulting binary
# (x86_64-apple-darwin for Intel, aarch64-apple-darwin for Apple Silicon).
MACOS_TARGET="${1:-x86_64-apple-darwin}"
. $GECKO_PATH/taskcluster/scripts/misc/macos-setup.sh

export CC=$MACOS_CC
export CXX=$MACOS_CXX
export AR=$MACOS_AR
export CFLAGS="${MACOS_CFLAGS}"
export CXXFLAGS="-stdlib=libc++ ${CFLAGS}"
export LDFLAGS="${CXXFLAGS} -Wl,-dead_strip"

# We patch tools/gn/bootstrap/bootstrap.py to detect this.
export MAC_CROSS=1

cd $GECKO_PATH

. taskcluster/scripts/misc/build-gn-common.sh
