#! /usr/bin/bash

reconfig_files(){
  cd $ICEWEASEL_TREE
  rm -f ./configure.old >/dev/null 2>&1
  rm -f ./old-configure >/dev/null 2>&1
  rm -f ./js/src/configure.old >/dev/null 2>&1
  rm -f ./js/src/old-configure >/dev/null 2>&1
}

MYOBJ_DIR=
ICEWEASEL_TREE=`pwd -W 2>/dev/null || pwd`
FIND_FILE=".mozconfig"
export CARGO_TARGET_DIR=/tmp/cargo_target
if [ ! -f "$FIND_FILE" ]; then
  [[ -f mozconfig32 ]] && cp mozconfig32 $FIND_FILE 2>/dev/null || cp mozconfig64 $FIND_FILE 2>/dev/null
fi
if [ ! -f "$FIND_FILE" ]; then
  echo $FIND_FILE not exist!
  exit 1;
fi
FIND_STR="ac_add_options --target=i686-pc-mingw32"
if [ "$OS" != "Windows_NT" ]; then
  PATH=$PATH:~/.cargo/bin
  MYOBJ_DIR="obju-linux64"
  MAKE=make
  PYTHON_SCRIPT=_virtualenvs/build/bin
  LOCAL_WITH_VC15=1
else
  if [ `grep -c "^$FIND_STR" $FIND_FILE` -ne '0' ];then
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju32-release"
  else
    [[ -n $MY_OBJ ]] && MYOBJ_DIR=$MY_OBJ || MYOBJ_DIR="obju64-release"
  fi
  MAKE=mozmake
  PYTHON_SCRIPT=_virtualenvs/build/Scripts
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
  export LIB="$compiler_path/lib:$compiler_path/lib/clang/$compiler_version/lib/windows"
fi

reconfig_files
rm -rf "../$MYOBJ_DIR"
mkdir "../$MYOBJ_DIR" && cd "../$MYOBJ_DIR"
$ICEWEASEL_TREE/configure --enable-profile-generate=cross
$MAKE -j4
if [ "$?" != "0" ]; then
  echo First compilation failed. > error.log
  exit 1;
fi

$MAKE package
if [ "$?" != "0" ]; then
  echo First package failed. > error.log
  exit 1;
fi

if [ -n "$LOCAL_WITH_VC15" ]; then
  echo LOCAL_WITH_VC15=$LOCAL_WITH_VC15
  $PYTHON_SCRIPT/python $ICEWEASEL_TREE/build/pgo/profileserver.py
else
  MOZ_HEADLESS=1 DISPLAY=22 $PYTHON_SCRIPT/python $ICEWEASEL_TREE/build/pgo/profileserver.py
fi

ls *.profraw >/dev/null 2>&1
if [ "$?" != "0" ]; then
  echo profileserver.py failed. >> error.log
  exit 1;
fi

$MAKE maybe_clobber_profiledbuild
if [ "$?" != "0" ]; then
  echo make maybe_clobber_profiledbuild failed. > error.log
  exit 1;
fi

reconfig_files
cd "../$MYOBJ_DIR"
if [ "$OS" != "Windows_NT" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --enable-linker=lld
elif [ "$MYOBJ_DIR" == "obju32-release" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=thin
else
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross
fi
$MAKE -j4

if [ "$?" != "0" ]; then
  echo Second compilation failed. >> error.log
  exit 1;
fi
$MAKE package
echo Compile completed!
rm -f $ICEWEASEL_TREE/$FIND_FILE>/dev/null 2>&1
rm -f $ICEWEASEL_TREE/configure.old >/dev/null 2>&1
rm -f $ICEWEASEL_TREE/old-configure >/dev/null 2>&1
rm -f $ICEWEASEL_TREE/js/src/configure.old >/dev/null 2>&1
rm -f $ICEWEASEL_TREE/js/src/old-configure >/dev/null 2>&1
  