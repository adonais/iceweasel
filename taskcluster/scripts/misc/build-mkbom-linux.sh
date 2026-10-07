#!/bin/bash
set -x -e -v

# This script is for building mkbom for Linux.
mkdir -p $UPLOAD_DIR

export PATH=$PATH:$MOZ_FETCHES_DIR/clang/bin
cd $MOZ_FETCHES_DIR/bomutils

# bomutils hardcodes CXXFLAGS/LDFLAGS in its Makefile, so the sysroot flags go
# into CXX to avoid overriding them.
CXX="$MOZ_FETCHES_DIR/clang/bin/clang++ --sysroot=$MOZ_FETCHES_DIR/sysroot"
CXX="$CXX -fuse-ld=lld -Wno-unused-command-line-argument"

make_flags="-j$(nproc)"
make "$make_flags" CXX="$CXX"

cd $(mktemp -d)
mkdir mkbom

cp $MOZ_FETCHES_DIR/bomutils/build/bin/mkbom ./mkbom/mkbom
tar caf $UPLOAD_DIR/mkbom.tar.zst ./mkbom
