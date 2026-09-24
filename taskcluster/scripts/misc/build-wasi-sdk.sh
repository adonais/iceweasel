#!/bin/bash
set -x -e -v

# Builds the wasm32-wasi compiler-rt or the full wasi-sysroot, chosen by the
# artifact name. Arguments are patches to apply to the wasi-sdk checkout.
artifact=$(basename $TOOLCHAIN_ARTIFACT)
dir=${artifact%.tar.*}

case "$artifact" in
  compiler-rt-*) mode=compiler-rt ;;
  sysroot-*) mode=sysroot ;;
  *) echo "Cannot determine build type from artifact: $artifact (expected compiler-rt-* or sysroot-*)" >&2; exit 1 ;;
esac

for p in "$@"; do
  patch -d $MOZ_FETCHES_DIR/wasi-sdk -p1 --fuzz=0 < $(dirname $0)/$p
done

cd $MOZ_FETCHES_DIR/wasi-sdk
CLANG=$MOZ_FETCHES_DIR/clang
export WASI_SDK_VERSION=34

# Use the llvm-project matching the pre-built clang, not the bundled submodule.
rm -rf src/llvm-project
ln -s $MOZ_FETCHES_DIR/llvm-project src/llvm-project

cmake -G Ninja -B build/sysroot -S . \
  -DCMAKE_C_COMPILER=$CLANG/bin/clang \
  -DCMAKE_CXX_COMPILER=$CLANG/bin/clang++ \
  -DWASI_SDK_TARGETS=wasm32-wasip1 \
  -DWASI_SDK_LTO=OFF \
  -DWASI_SDK_EXCEPTIONS=OFF \
  -DWASI_SDK_BUILD_SHARED=OFF \
  -DWASI_SDK_CPU_CFLAGS=

case "$mode" in
  compiler-rt)
    cmake --build build/sysroot --target compiler-rt -j$(nproc)
    mkdir -p $dir
    cp -r build/sysroot/install/wasi-resource-dir/lib $dir/
    test -f $dir/lib/wasm32-unknown-wasi/libclang_rt.builtins.a
    ;;
  sysroot)
    cmake --build build/sysroot -j$(nproc)
    mv build/sysroot/install/share/wasi-sysroot $dir
    # Compatibility for consumers still using the wasm32-wasi triple.
    cp -r $dir/lib/wasm32-wasip1 $dir/lib/wasm32-wasi
    cp -r $dir/include/wasm32-wasip1 $dir/include/wasm32-wasi
    ;;
esac

tar --zstd -cf $artifact $dir
mkdir -p $UPLOAD_DIR
mv $artifact $UPLOAD_DIR/
