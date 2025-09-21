#! /usr/bin/env bash

reconfig_files(){
  cd "$ICEWEASEL_TREE"
  rm -f ./configure.old >/dev/null 2>&1
  rm -f ./old-configure >/dev/null 2>&1
  rm -f ./js/src/configure.old >/dev/null 2>&1
  rm -f ./js/src/old-configure >/dev/null 2>&1
}

MAKE=make
MYOBJ_DIR=
FIND_FILE=".mozconfig"
TARGETED_OS=Windows_NT
ICEWEASEL_TREE=`pwd -W 2>/dev/null || pwd`

export LLVM_PROFDATA=llvm-profdata
export CARGO_TARGET_DIR=/tmp/cargo_target
export MOZ_FETCHES_DIR=/builds/worker/fetches
export MOZBUILD_STATE_PATH=$MOZ_FETCHES_DIR/.mozbuild
export WINSYSROOT=/builds/worker/fetches/vs
export VC_REDISTDIR=$WINSYSROOT/VC/Redist/MSVC/14.38.33135/
export UCRT_REDISTDIR="$WINSYSROOT/Windows Kits/10/Redist/10.0.22621.0/"
export LIBPORTABLE_PATH=$MOZ_FETCHES_DIR/clang
export WINE=$MOZ_FETCHES_DIR/wine/bin/wine64
export WINEPREFIX=$MOZ_FETCHES_DIR/.wine
export PATH=$MOZ_FETCHES_DIR/clang/bin:$MOZ_FETCHES_DIR/rust/bin:$PATH

if [ x"$1" == "x" ]; then
  echo The script must run with parameters!
  exit 1
fi

if [ "$OS" == "Windows_NT" ]; then
  echo This script must be run on the Linux platform
  exit 1
fi

compiler=$(which clang)
if [ -z "$compiler" ]; then
  echo clang not found!
  exit 1
fi

if [ x"$1" == "x64" ]; then
  export MYOBJ_DIR="obju64-release"
  export ICEWEASEL_BITS=64
elif [ x"$1" == "x32" ]; then
  export MYOBJ_DIR="obju32-release"
  export ICEWEASEL_BITS=32
else
  echo Wrong parameter values[32, 64]
  exit 1
fi

if [ "$TARGETED_OS" != "Windows_NT" ]; then
  cp mozconfig_linux $FIND_FILE 2>/dev/null
else
  cp mozconfig_win $FIND_FILE 2>/dev/null
fi
if [ ! -f "$FIND_FILE" ]; then
  echo $FIND_FILE not exist!
  exit 1
fi

if [ "$TARGETED_OS" == "Windows_NT" ]; then
  export UPX="${MOZ_FETCHES_DIR}/upx-win64/upx.exe"
  if [ -f "${UPX}" ]; then
    chmod +x "${UPX}"
  fi
fi

reconfig_files
rm -rf "../$MYOBJ_DIR"
mkdir "../$MYOBJ_DIR" && cd "../$MYOBJ_DIR"
export LIBPORTABLE_AUTOBUILD_DIR=`pwd`

if [ "$TARGETED_OS" != "Windows_NT" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --enable-linker=lld
elif [ "$MYOBJ_DIR" == "obju32-release" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=thin --with-pgo-profile-path=/builds/worker/fetches/merged32.profdata --with-pgo-jarlog=/builds/worker/fetches/en-US32.log
else
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --with-pgo-profile-path=/builds/worker/fetches/merged64.profdata --with-pgo-jarlog=/builds/worker/fetches/en-US64.log
fi

$MAKE -j4

if [ "$?" != "0" ]; then
  echo Second compilation failed. >> error.log
  exit 1;
fi

$MAKE package

echo Clean python cache!
find "$ICEWEASEL_TREE" \( -path "$ICEWEASEL_TREE/.git" -prune \) -o -name "__pycache__" -type d -print | xargs -I {} rm -rf "{}"
echo Compile completed!
rm -f "$ICEWEASEL_TREE/$FIND_FILE" >/dev/null 2>&1
reconfig_files

ls -la "$LIBPORTABLE_AUTOBUILD_DIR/dist"
