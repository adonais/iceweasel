#!/bin/bash
set -x -e -v

artifact=$(basename "$TOOLCHAIN_ARTIFACT")
project=${artifact%.tar.*}
workspace=$HOME/workspace

TARGET=$1
shift

FEATURES="$@"

export CARGO_PROFILE_RELEASE_LTO=fat
rust_lto_flags="-C codegen-units=1"

case "$TARGET" in
*-unknown-linux-gnu)
    # Native or cross-compiled Linux Build
    arch=${TARGET%%-*}
    sysroot=$MOZ_FETCHES_DIR/sysroot
    if [ ! -d "$sysroot" ]; then
        sysroot=$MOZ_FETCHES_DIR/sysroot-$arch-linux-gnu
    fi
    export RUSTFLAGS="-Clinker=$MOZ_FETCHES_DIR/clang/bin/clang++ -C link-arg=--sysroot=$sysroot -C link-arg=-fuse-ld=lld -C link-arg=--target=$TARGET $rust_lto_flags"
    export CC=$MOZ_FETCHES_DIR/clang/bin/clang
    export CXX=$MOZ_FETCHES_DIR/clang/bin/clang++
    # Not using TARGET_C*FLAGS because that applies only on target compilations,
    # while the linker flags passed through RUSTFLAGS apply to both host and target
    # when not cross-compiling, leading to a sysroot discrepancy.
    # Using C*FLAGS_x86_64_unknown_linux_gnu makes the flags apply to both host
    # and target when not cross-compiling.
    export CFLAGS_${arch}_unknown_linux_gnu="--sysroot=$sysroot -fuse-ld=lld -Wno-unused-command-line-argument"
    export CXXFLAGS_${arch}_unknown_linux_gnu="-D_GLIBCXX_USE_CXX11_ABI=0 --sysroot=$sysroot -fuse-ld=lld -Wno-unused-command-line-argument"
    # Point pkg-config exclusively at the sysroot
    export PKG_CONFIG_ALLOW_CROSS=1
    export PKG_CONFIG_SYSROOT_DIR=$sysroot
    export PKG_CONFIG_LIBDIR="$sysroot/usr/lib/$arch-linux-gnu/pkgconfig:$sysroot/usr/lib/pkgconfig:$sysroot/usr/share/pkgconfig"
    ;;
*-apple-darwin)
    # Cross-compiling for Mac on Linux.
    if test "$TARGET" = "aarch64-apple-darwin"; then
        export MACOSX_DEPLOYMENT_TARGET=11.0
    else
        export MACOSX_DEPLOYMENT_TARGET=10.15
    fi
    MACOS_SYSROOT=$MOZ_FETCHES_DIR/MacOSX26.5.sdk
    export RUSTFLAGS="-Clinker=$MOZ_FETCHES_DIR/clang/bin/clang++ -C link-arg=-isysroot -C link-arg=$MACOS_SYSROOT -C link-arg=-fuse-ld=lld -C link-arg=--target=$TARGET $rust_lto_flags"
    export CC="$MOZ_FETCHES_DIR/clang/bin/clang"
    export CXX="$MOZ_FETCHES_DIR/clang/bin/clang++"
    export TARGET_CFLAGS="-isysroot $MACOS_SYSROOT -fuse-ld=lld -Wno-unused-command-line-argument"
    export TARGET_CXXFLAGS="-isysroot $MACOS_SYSROOT -fuse-ld=lld -Wno-unused-command-line-argument -stdlib=libc++"
    ;;
*-pc-windows-msvc)
    # Cross-compiling for Windows on Linux.
    export CC=$MOZ_FETCHES_DIR/clang/bin/clang-cl
    export CXX=$MOZ_FETCHES_DIR/clang/bin/clang-cl
    export TARGET_AR=$MOZ_FETCHES_DIR/clang/bin/llvm-lib

    . $GECKO_PATH/taskcluster/scripts/misc/vs-setup.sh
    export CARGO_TARGET_I686_PC_WINDOWS_MSVC_LINKER=$MOZ_FETCHES_DIR/clang/bin/lld-link
    export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=$MOZ_FETCHES_DIR/clang/bin/lld-link
    export CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER=$MOZ_FETCHES_DIR/clang/bin/lld-link
    export TARGET_CFLAGS="-Xclang -ivfsoverlay -Xclang $MOZ_FETCHES_DIR/vs/overlay.yaml"
    export TARGET_CXXFLAGS="-Xclang -ivfsoverlay -Xclang $MOZ_FETCHES_DIR/vs/overlay.yaml"
    ;;
esac

PATH="$MOZ_FETCHES_DIR/rustc/bin:$MOZ_FETCHES_DIR/clang/bin:${EXTRA_PATH:+$EXTRA_PATH:}$PATH"

if [ -n "${CRATE_PATH}" ]; then
  CRATE_PATH="${GECKO_PATH}/${CRATE_PATH}"
else
  CRATE_PATH=$MOZ_FETCHES_DIR/${FETCH-$project}
fi

WORKSPACE_ROOT=$(cd $CRATE_PATH; cargo metadata --format-version 1 --no-deps --locked 2> /dev/null | jq -r .workspace_root)

if test ! -f $WORKSPACE_ROOT/Cargo.lock; then
  CARGO_LOCK=taskcluster/scripts/misc/$project-Cargo.lock
  if test -f $GECKO_PATH/$CARGO_LOCK; then
    cp $GECKO_PATH/$CARGO_LOCK $WORKSPACE_ROOT/Cargo.lock
  else
    echo "Missing Cargo.lock for the crate. Please provide one in $CARGO_LOCK" >&2
    exit 1
  fi
fi

if [[ -v RUN_TESTS ]]; then
  pushd $CRATE_PATH
  cargo test \
    --locked \
    --verbose \
    --target-dir $workspace/obj \
    --target "$TARGET" \
    ${FEATURES:+--features "$FEATURES"}
  popd
fi

cargo install \
  --locked \
  --verbose \
  --path $CRATE_PATH \
  --target-dir $workspace/obj \
  --root $workspace/out \
  --target "$TARGET" \
  ${FEATURES:+--features "$FEATURES"}

mkdir $workspace/$project
mv $workspace/out/bin/* $workspace/$project
tar -C $workspace -acvf $project.tar.zst $project
mkdir -p $UPLOAD_DIR
mv $project.tar.zst $UPLOAD_DIR
