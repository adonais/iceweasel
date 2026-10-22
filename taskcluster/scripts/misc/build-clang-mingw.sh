#!/bin/bash
set -x -e -v

# This script is for building a mingw-clang toolchain for use on Linux.

if [[ $# -eq 0 ]]; then
    echo "Provide either x86 or x64 to specify a toolchain."
    exit 1;
elif [ "$1" == "x86" ]; then
  machine="i686"
  compiler_rt_machine="i386"
  crt_flags="--enable-lib32 --disable-lib64"
elif [ "$1" == "x64" ]; then
  machine="x86_64"
  compiler_rt_machine="x86_64"
  crt_flags="--disable-lib32 --enable-lib64"
else
  echo "Provide either x86 or x64 to specify a toolchain."
  exit 1;
fi

TOOLCHAIN_DIR=$MOZ_FETCHES_DIR/llvm-project
INSTALL_DIR=$MOZ_FETCHES_DIR/clang
CROSS_PREFIX_DIR=$INSTALL_DIR/$machine-w64-mingw32

make_flags="-j$(nproc)"

prepare() {
  pushd $MOZ_FETCHES_DIR/mingw-w64
  for p in $GECKO_PATH/taskcluster/scripts/misc/mingw-*.patch; do
    patch -p1 <$p
  done
  popd
}

install_wrappers() {
  pushd $INSTALL_DIR/bin

  compiler_flags="--sysroot \$DIR/../$machine-w64-mingw32 -rtlib=compiler-rt -stdlib=libc++ -fuse-ld=lld -fuse-cxa-atexit -Qunused-arguments"

  cat <<EOF >$machine-w64-mingw32-clang
#!/bin/sh
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
\$DIR/clang -target $machine-w64-mingw32 $compiler_flags "\$@"
EOF
  chmod +x $machine-w64-mingw32-clang

  cat <<EOF >$machine-w64-mingw32-clang++
#!/bin/sh
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
\$DIR/clang -target $machine-w64-mingw32 --driver-mode=g++ $compiler_flags "\$@"
EOF
  chmod +x $machine-w64-mingw32-clang++

  CC="$machine-w64-mingw32-clang"
  CXX="$machine-w64-mingw32-clang++"

  popd
}

build_mingw() {
  mkdir mingw-w64-headers
  pushd mingw-w64-headers
  $MOZ_FETCHES_DIR/mingw-w64/mingw-w64-headers/configure \
    --host=$machine-w64-mingw32 \
    --enable-sdk=all \
    --enable-idl \
    --prefix=$CROSS_PREFIX_DIR
  make $make_flags install
  popd

  mkdir mingw-w64-crt
  pushd mingw-w64-crt
  $MOZ_FETCHES_DIR/mingw-w64/mingw-w64-crt/configure \
    --host=$machine-w64-mingw32 \
    $crt_flags \
    CC="$CC" \
    AR=llvm-ar \
    RANLIB=llvm-ranlib \
    DLLTOOL=llvm-dlltool \
    --prefix=$CROSS_PREFIX_DIR
  make $make_flags
  make $make_flags install
  popd

  mkdir widl
  pushd widl
  $MOZ_FETCHES_DIR/mingw-w64/mingw-w64-tools/widl/configure --target=$machine-w64-mingw32 --prefix=$INSTALL_DIR
  make $make_flags
  make $make_flags install
  popd
}

build_compiler_rt() {
  CLANG_VERSION=$(basename $(dirname $(dirname $(dirname $($CC --print-libgcc-file-name -rtlib=compiler-rt)))))
  mkdir compiler-rt
  pushd compiler-rt
  cmake \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=$CC \
      -DCMAKE_SYSTEM_NAME=Windows \
      -DCMAKE_AR=$INSTALL_DIR/bin/llvm-ar \
      -DCMAKE_RANLIB=$INSTALL_DIR/bin/llvm-ranlib \
      -DCMAKE_C_COMPILER_WORKS=1 \
      -DCMAKE_C_COMPILER_TARGET=$compiler_rt_machine-windows-gnu \
      -DCOMPILER_RT_DEFAULT_TARGET_ONLY=TRUE \
      $TOOLCHAIN_DIR/compiler-rt/lib/builtins
  make $make_flags
  mkdir -p $INSTALL_DIR/lib/clang/$CLANG_VERSION/lib/windows
  cp lib/windows/libclang_rt.builtins-$compiler_rt_machine.a $INSTALL_DIR/lib/clang/$CLANG_VERSION/lib/windows/
  popd
}

build_runtimes() {
  # Below, we specify -g -gcodeview to build static libraries with debug information.
  # Because we're not distributing these builds, this is fine. If one were to distribute
  # the builds, perhaps one would want to make those flags conditional or investigation
  # other options.
  DEBUG_FLAGS="-g -gcodeview"

  # First configure libcxx
  mkdir runtimes
  pushd runtimes
  cmake \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=$CROSS_PREFIX_DIR \
      -DCMAKE_C_COMPILER=$CC \
      -DCMAKE_CXX_COMPILER=$CXX \
      -DCMAKE_CROSSCOMPILING=TRUE \
      -DCMAKE_SYSTEM_NAME=Windows \
      -DCMAKE_C_COMPILER_WORKS=TRUE \
      -DCMAKE_CXX_COMPILER_WORKS=TRUE \
      -DLLVM_COMPILER_CHECKED=TRUE \
      -DCMAKE_AR=$INSTALL_DIR/bin/llvm-ar \
      -DCMAKE_RANLIB=$INSTALL_DIR/bin/llvm-ranlib \
      -DCMAKE_CXX_FLAGS="${DEBUG_FLAGS}" \
      -DLIBCXX_USE_COMPILER_RT=ON \
      -DLIBCXX_INSTALL_HEADERS=ON \
      -DLIBCXX_ENABLE_EXCEPTIONS=ON \
      -DLIBCXX_ENABLE_THREADS=ON \
      -DLIBCXX_HAS_WIN32_THREAD_API=ON \
      -DLIBCXX_ENABLE_MONOTONIC_CLOCK=ON \
      -DLIBCXX_ENABLE_SHARED=OFF \
      -DLIBCXX_ENABLE_FILESYSTEM=ON \
      -DLIBCXX_ENABLE_STATIC_ABI_LIBRARY=TRUE \
      -DLIBCXX_CXX_ABI=libcxxabi \
      -DLIBCXXABI_USE_LLVM_UNWINDER=TRUE \
      -DLIBCXXABI_ENABLE_STATIC_UNWINDER=TRUE \
      -DLIBUNWIND_USE_COMPILER_RT=TRUE \
      -DLIBUNWIND_ENABLE_THREADS=TRUE \
      -DLIBUNWIND_ENABLE_SHARED=FALSE \
      -DLIBUNWIND_ENABLE_CROSS_UNWINDING=FALSE \
      -DLIBUNWIND_CXX_FLAGS="${DEBUG_FLAGS} -Wno-dll-attribute-on-redeclaration -nostdinc++ -DPSAPI_VERSION=2" \
      -DLIBUNWIND_C_FLAGS="-Wno-dll-attribute-on-redeclaration" \
      -DLIBUNWIND_ENABLE_FRAME_APIS=ON \
      -DLIBCXXABI_USE_COMPILER_RT=ON \
      -DLIBCXXABI_ENABLE_EXCEPTIONS=ON \
      -DLIBCXXABI_ENABLE_THREADS=ON \
      -DLIBCXXABI_ENABLE_SHARED=OFF \
      -DLIBCXXABI_CXX_FLAGS="${DEBUG_FLAGS}" \
      -DLLVM_ENABLE_RUNTIMES="libcxxabi;libcxx;libunwind" \
      $TOOLCHAIN_DIR/runtimes

  make $make_flags VERBOSE=1
  make $make_flags install

  popd
}

build_libssp_stubs() {
  for lib in libssp{,_nonshared}; do llvm-ar rcs $CROSS_PREFIX_DIR/lib/$lib.a; done
}

build_utils() {
  pushd $INSTALL_DIR/bin/
  for prog in ar nm objcopy ranlib readobj strip windres; do
    ln -s llvm-$prog $machine-w64-mingw32-$prog
  done
  popd
}

export PATH=$INSTALL_DIR/bin:$PATH

prepare

mkdir $TOOLCHAIN_DIR/build
pushd $TOOLCHAIN_DIR/build

install_wrappers
build_mingw
build_compiler_rt
build_runtimes
build_libssp_stubs
build_utils

popd

# Put a tarball in the artifacts dir
mkdir -p $UPLOAD_DIR

pushd $(dirname $INSTALL_DIR)
tar caf clangmingw.tar.zst clang
mv clangmingw.tar.zst $UPLOAD_DIR
popd
