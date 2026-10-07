#!/bin/bash
set -x -e -v

PROJECT="upx"

if [[ -d "$MOZ_FETCHES_DIR/cmake" ]]; then
    export PATH="$(cd "$MOZ_FETCHES_DIR/cmake" && pwd)/bin:${PATH}"
fi

CMAKE_EXTRA_ARGS=()

if [[ $(uname -o) == "Msys" ]]; then
  SUFFIX=".exe"
  . "$GECKO_PATH/taskcluster/scripts/misc/vs-setup.sh"
else
  SUFFIX=""
  # Build against the in-tree sysroot rather than the docker image's libraries,
  # so that the shipped binary keeps running on older distributions.
  CMAKE_EXTRA_ARGS+=(
    "-DCMAKE_C_COMPILER=$MOZ_FETCHES_DIR/clang/bin/clang"
    "-DCMAKE_CXX_COMPILER=$MOZ_FETCHES_DIR/clang/bin/clang++"
    "-DCMAKE_SYSROOT=$MOZ_FETCHES_DIR/sysroot"
    "-DCMAKE_EXE_LINKER_FLAGS_INIT=-fuse-ld=lld"
  )
fi

pushd "${MOZ_FETCHES_DIR}/${PROJECT}"
cmake -S . -B build/release -DCMAKE_BUILD_TYPE=Release "${CMAKE_EXTRA_ARGS[@]}"
cmake --build build/release --parallel $(nproc)
popd

mkdir -p "${PROJECT}/bin"
mv "${MOZ_FETCHES_DIR}/${PROJECT}/build/release/upx${SUFFIX}" "${PROJECT}/bin/"
tar -acf "${PROJECT}.tar.zst" "${PROJECT}"

mkdir -p "$UPLOAD_DIR"
mv "${PROJECT}.tar.zst" "$UPLOAD_DIR"
