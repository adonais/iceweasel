#! /usr/bin/env bash

reconfig_files(){
  cd "$ICEWEASEL_TREE"
  rm -f ./configure.old >/dev/null 2>&1
  rm -f ./old-configure >/dev/null 2>&1
  rm -f ./js/src/configure.old >/dev/null 2>&1
  rm -f ./js/src/old-configure >/dev/null 2>&1
}

MYOBJ_DIR=
TARGETED_OS=linux
ICEWEASEL_TREE=`pwd -W 2>/dev/null || pwd`
FIND_FILE=".mozconfig"
FIND_STR="target=i686-pc"
FIND_STR2="target=x86_64-pc"

export LLVM_PROFDATA=llvm-profdata
export CARGO_TARGET_DIR=/tmp/cargo_target
export MOZ_FETCHES_DIR=/builds/worker/fetches
export MOZBUILD_STATE_PATH=$MOZ_FETCHES_DIR/.mozbuild
export WINSYSROOT=/builds/worker/fetches/vs
export VC_REDISTDIR=$WINSYSROOT/VC/Redist/MSVC/14.38.33135/
export LIBPORTABLE_PATH=$MOZ_FETCHES_DIR/clang
export WINE=$MOZ_FETCHES_DIR/wine/bin/wine64
export WINEPREFIX=$MOZ_FETCHES_DIR/.wine
export PATH=$MOZ_FETCHES_DIR/clang/bin:$MOZ_FETCHES_DIR/rust/bin:$PATH

if [ ! -f "$FIND_FILE" ]; then
  [[ -f mozconfig32 ]] && cp mozconfig32 $FIND_FILE 2>/dev/null || cp mozconfig64 $FIND_FILE 2>/dev/null
fi
if [ ! -f "$FIND_FILE" ]; then
  echo $FIND_FILE not exist!
  exit 1;
fi

if [ "$OS" != "Windows_NT" ]; then
  if [ `grep "^#" $FIND_FILE -v | grep -c "$FIND_STR"` -ne '0' ];then
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju32-release"
    TARGETED_OS=Windows_NT
  elif [ `grep "^#" $FIND_FILE -v | grep -c "$FIND_STR2"` -ne '0' ];then
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju64-release"
    TARGETED_OS=Windows_NT
  else
    MYOBJ_DIR="obju-linux64"
  fi
  MAKE=make
else
  if [ `grep "^#" $FIND_FILE -v | grep -c "$FIND_STR"` -ne '0' ];then
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju32-release"
  else
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju64-release"
  fi
  MAKE=mozmake
fi

compiler=$(which clang)
if [ -z "$compiler" ]; then
  echo clang not exit
  exit 1;
fi
compiler_version=$(echo __clang_major__ | $compiler -E -xc - 2>/dev/null | tail -n 1)
if [ -z "$compiler_version" ]; then
  exit 1;
fi
compiler_path=$(dirname $(dirname $compiler))
if [ "$TARGETED_OS" != "Windows_NT" ]; then
  export LIB="$compiler_path/lib:$compiler_path/lib/clang/$compiler_version/lib/linux"
else
  export LIB="$compiler_path/lib:$compiler_path/lib/clang/$compiler_version/lib/windows"
fi

echo "Clean old files ..."
reconfig_files
rm -rf "../$MYOBJ_DIR"
mkdir "../$MYOBJ_DIR" && cd "../$MYOBJ_DIR"

if [ "$TARGETED_OS" != "Windows_NT" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --enable-linker=lld
elif [ "$MYOBJ_DIR" == "obju32-release" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=thin --with-pgo-profile-path=/builds/worker/fetches/merged.profdata
else
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --with-pgo-profile-path=/builds/worker/fetches/merged.profdata
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
