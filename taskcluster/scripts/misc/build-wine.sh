#!/bin/bash
set -x -e -v

WORKSPACE=$HOME/workspace
INSTALL_DIR=$WORKSPACE/wine

mkdir -p $INSTALL_DIR
mkdir -p $WORKSPACE/build/wine
mkdir -p $WORKSPACE/build/wine64

CC="$MOZ_FETCHES_DIR/gcc/bin/gcc --sysroot=$MOZ_FETCHES_DIR/sysroot"

cd $WORKSPACE/build/wine64
$MOZ_FETCHES_DIR/wine-source/configure --enable-win64 --without-mingw --without-x --without-freetype --prefix=$INSTALL_DIR/ CC="$CC"
make -j$(nproc)

cd $WORKSPACE/build/wine
$MOZ_FETCHES_DIR/wine-source/configure --with-wine64=../wine64 --without-mingw --without-x --without-freetype --prefix=$INSTALL_DIR/ CC="$CC"
make -j$(nproc)
make install

cd $WORKSPACE/build/wine64
make install

# --------------

cd $WORKSPACE/
tar caf wine.tar.zst wine

mkdir -p $UPLOAD_DIR
cp wine.tar.* $UPLOAD_DIR
