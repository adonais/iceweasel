#! /usr/bin/bash

reconfig_files(){
  cd $ICEWEASEL_TREE
  rm -f ./configure.old >/dev/null 2>&1
  rm -f ./old-configure >/dev/null 2>&1
  rm -f ./js/src/configure.old >/dev/null 2>&1
  rm -f ./js/src/old-configure >/dev/null 2>&1
}

MYOBJ_DIR=
FIND_FILE=".mozconfig"
ICEWEASEL_TREE=`pwd -W 2>/dev/null || pwd`

export CCACHE=sccache
export LLVM_PROFDATA=llvm-profdata
export CARGO_TARGET_DIR=/tmp/cargo_target

compiler=$(which clang)
if [ -z "$compiler" ]; then
  echo clang not found!
  exit 1
fi

if [ "$OS" != "Windows_NT" ]; then
  cp mozconfig_linux64 $FIND_FILE 2>/dev/null
else
  cp mozconfig_win64 $FIND_FILE 2>/dev/null
fi

if [ ! -f "$FIND_FILE" ]; then
  echo $FIND_FILE not exist!
  exit 1;
fi

if [ "$OS" != "Windows_NT" ]; then
  PATH=$PATH:~/.cargo/bin
  MYOBJ_DIR="obju-linux64"
  MAKE=make
else
  MYOBJ_DIR="obju64-release"
  MAKE=mozmake
fi

reconfig_files
rm -rf "../$MYOBJ_DIR"
mkdir "../$MYOBJ_DIR" && cd "../$MYOBJ_DIR"
export LIBPORTABLE_AUTOBUILD_DIR=`pwd`

if [ "OS" != "Windows_NT" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-generate=cross --enable-lto=cross --enable-linker=lld
elif [ "$MYOBJ_DIR" == "obju32-release" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-generate=cross --enable-lto=thin
else
  $ICEWEASEL_TREE/configure --enable-profile-generate=cross --enable-lto=cross
fi

$MAKE -j8
if [ "$?" != "0" ]; then
  echo First compilation failed.
  exit 1;
fi

$MAKE package
if [ "$?" != "0" ]; then
  echo First package failed.
  exit 1;
fi

if [ "$OS" != "Windows_NT" ]; then
TMP_MOZBUILD=$HOME/.mozbuild/srcdirs
else
TMP_MOZBUILD=$USERPROFILE/.mozbuild/srcdirs
fi
TMP_PYTHON=`ls -lt $TMP_MOZBUILD|grep ff-git|head -n 1|awk '{print $9}'`
if [ "$OS" != "Windows_NT" ]; then
PYTHON3=$TMP_MOZBUILD/$TMP_PYTHON/_virtualenvs/build/bin/python
else
PYTHON3=$TMP_MOZBUILD/$TMP_PYTHON/_virtualenvs/build/Scripts/python.exe
fi
if [ -z "$PYTHON3" ]; then
  echo python3 not exit
  exit 1;
fi
echo we find python[$PYTHON3]

cd "../$MYOBJ_DIR"
export JARLOG_FILE="$PWD/en-US.log"
$PYTHON3 $ICEWEASEL_TREE/build/pgo/profileserver.py

ls *.profraw >/dev/null 2>&1
if [ "$?" != "0" ]; then
  echo profileserver.py failed.
  exit 1;
fi

reconfig_files

cd "../$MYOBJ_DIR"
if [ ! -f "merged.profdata" ]; then
  echo merged.profdata not exist.
  exit 1;
fi

echo "Clean `pwd` ..."
shopt -s extglob
rm -rf !(merged.profdata|en-US.log|buildid.h|source-repo.h)
sleep 3s

if [ "$OS" != "Windows_NT" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --enable-linker=lld --with-pgo-profile-path=$PWD/merged.profdata --with-pgo-jarlog=$PWD/en-US.log
elif [ "$MYOBJ_DIR" == "obju32-release" ]; then
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=thin --with-pgo-profile-path=$PWD/merged.profdata --with-pgo-jarlog=$PWD/en-US.log
else
  $ICEWEASEL_TREE/configure --enable-profile-use=cross --enable-lto=cross --with-pgo-profile-path=$PWD/merged.profdata --with-pgo-jarlog=$PWD/en-US.log
fi
$MAKE -j8

if [ "$?" != "0" ]; then
  echo Second compilation failed.
  exit 1;
fi
$MAKE package

echo Clean python cache!
find "$ICEWEASEL_TREE" \( -path "$ICEWEASEL_TREE/.git" -prune \) -o -name "__pycache__" -type d -print | xargs -I {} rm -rf "{}"
echo Compile completed!
rm -f "$ICEWEASEL_TREE/$FIND_FILE" >/dev/null 2>&1
reconfig_files
