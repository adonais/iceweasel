#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -x -e -v

# This script is for building the onnx runtime using upstream build system.

target_platform="$1"
target_arch="$2"

###
# Gather build dependencies from fetches

if test -d "$MOZ_FETCHES_DIR/cmake"; then
    export PATH="$(cd $MOZ_FETCHES_DIR/cmake && pwd)/bin:${PATH}"
fi

onnxruntime_depdir="$MOZ_FETCHES_DIR/onnxruntime-deps"

export PATH="$(cd $MOZ_FETCHES_DIR/ninja && pwd)/bin:${PATH}"
export PATH="$(cd $MOZ_FETCHES_DIR/clang && pwd)/bin:${PATH}"

export CC=clang
export CXX=clang++

###
# Extra setup per platform
case ${target_platform} in
    Darwin)
        case $target_arch in
            arm64)
                target_triple=aarch64-apple-darwin
                macosx_deployment_target=11.0
                ;;
            x86_64)
                target_triple=x86_64-apple-darwin
                macosx_deployment_target=10.15
                ;;
            *)
                echo "ERROR: unsupported Darwin architecture $target_arch" >&2
                exit 1
                ;;
        esac
        osx_sysroot=`cd ${MOZ_FETCHES_DIR}/MacOSX*.sdk; pwd`
        # cmake probes the mac-only sw_vers; the version it sees doesn't matter.
        mkdir -p "$PWD/fakebin"
        printf '#!/bin/sh\necho 10.15\n' > "$PWD/fakebin/sw_vers"
        chmod +x "$PWD/fakebin/sw_vers"
        export PATH="$PATH:$PWD/fakebin"
        extra_args=(--cmake_extra_defines
            CMAKE_SYSTEM_NAME=Darwin
            CMAKE_SYSTEM_PROCESSOR=$target_arch
            CMAKE_OSX_ARCHITECTURES=$target_arch
            CMAKE_OSX_SYSROOT=${osx_sysroot}
            CMAKE_OSX_DEPLOYMENT_TARGET=$macosx_deployment_target
            CMAKE_C_COMPILER_TARGET=$target_triple
            CMAKE_CXX_COMPILER_TARGET=$target_triple
            CMAKE_ASM_COMPILER_TARGET=$target_triple
            CMAKE_AR=${MOZ_FETCHES_DIR}/clang/bin/llvm-ar
            CMAKE_RANLIB=${MOZ_FETCHES_DIR}/clang/bin/llvm-ranlib)
        TARGET_FLAGS="-fuse-ld=lld -Wno-unused-command-line-argument"
        prefix=lib
        extension=dylib
        HARDENING_FLAGS="-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2 -fstack-protector-strong"
        ;;
    Linux)
        HARDENING_FLAGS="-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2 -fstack-clash-protection -fstack-protector-strong"
        # Even the sysroot's libstdc++ is newer than the one Firefox targets, and
        # std::filesystem, which onnxruntime uses, can't be shimmed the way
        # build/unix/stdc++compat does it, so link it statically. Only the Ort* C
        # entry points are exported, so no C++ symbols or objects cross into
        # Gecko.
        EXTRA_CXX_FLAGS="-static-libstdc++ -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now -Wl,-Bsymbolic-functions -Wp,-D_GLIBCXX_ASSERTIONS"
        # This library is shipped to users, so build it against the same sysroot
        # Firefox itself uses rather than the build machine's system headers and
        # libraries, which are much newer than what Firefox supports.
        case $target_arch in
            aarch64)
                sysroot=$MOZ_FETCHES_DIR/sysroot-aarch64-linux-gnu
                extra_args=(--cmake_extra_defines CMAKE_SYSTEM_NAME=Linux CMAKE_SYSTEM_PROCESSOR=aarch64 CMAKE_C_COMPILER_TARGET=aarch64-unknown-linux-gnu CMAKE_CXX_COMPILER_TARGET=aarch64-unknown-linux-gnu CMAKE_ASM_COMPILER_TARGET=aarch64-unknown-linux-gnu CMAKE_SYSROOT=$sysroot)
                ;;
            x64)
                sysroot=$MOZ_FETCHES_DIR/sysroot-x86_64-linux-gnu
                extra_args=(--cmake_extra_defines CMAKE_SYSROOT=$sysroot)
                HARDENING_FLAGS="$HARDENING_FLAGS -fcf-protection"
                ;;
            *)
                echo "ERROR: unsupported Linux architecture $target_arch" >&2
                exit 1
                ;;
        esac
        TARGET_FLAGS="-fuse-ld=lld -Wno-unused-command-line-argument"
        prefix=lib
        extension=so
        ;;
    Android)
        extra_args=(--android --android_ndk_path=$MOZ_FETCHES_DIR/android-ndk --android_sdk_path=$MOZ_FETCHES_DIR/android-sdk-linux --android_abi=$target_arch)
        prefix=lib
        extension=so
        HARDENING_FLAGS="-fstack-clash-protection -fstack-protector-strong"
        EXTRA_CXX_FLAGS="-Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now"
        ;;
    Windows)
        # Still use VS there, compilation through clang-cl is not supported by onnxruntime.
        case $target_arch in
            x86)
                extra_args=(--cmake_extra_defines CMAKE_SYSTEM_NAME=Windows CMAKE_SYSTEM_PROCESSOR=x86)
                export TARGET=i686-pc-windows-msvc
                ;;
            aarch64)
                # armasm64 rejects kleidiai's gnu-style .S files; clang-cl could assemble them.
                extra_args=(--arm64 --no_kleidiai --cmake_extra_defines CMAKE_SYSTEM_NAME=Windows CMAKE_SYSTEM_PROCESSOR=ARM64)
                export TARGET=aarch64-pc-windows-msvc
                ;;
        esac
        HARDENING_FLAGS="/guard:cf"
        extra_args+=(--cmake_extra_defines "CMAKE_SHARED_LINKER_FLAGS=/MANIFEST:NO /guard:cf")
        . $GECKO_PATH/taskcluster/scripts/misc/vs-setup.sh
        sed -i -e 's/ProgramDatabase//' "$MOZ_FETCHES_DIR/onnxruntime/tools/ci_build/build.py"
        # build.py appends its own CMAKE_C_FLAGS/CMAKE_CXX_FLAGS=/MP after the extra defines and
        # cmake keeps the last definition, which would drop ours. /MP does nothing under Ninja.
        sed -i -e 's/if njobs > 1:/if False:/' "$MOZ_FETCHES_DIR/onnxruntime/tools/ci_build/build.py"
        if [ "$target_arch" = "aarch64" ]; then
            # x64-hosted rc.exe; the arm64 SDK bin ships an ARM64-hosted one.
            export PATH="${UNIX_VSPATH}/${SDKDIR}/bin/${SDK_VERSION}/x64:${PATH}"
            # build.py refuses Ninja+arm64 outside a VS Cross Tools shell; vs-setup.sh already provides that env.
            sed -i -e 's/if cpu_arch == "32bit" or args.arm or args.arm64 or args.arm64ec:/if False:/' "$MOZ_FETCHES_DIR/onnxruntime/tools/ci_build/build.py"
        fi
        export CC=cl.exe
        export CXX=cl.exe
        prefix=
        extension=dll
        ;;
esac

artifact=$(basename "$TOOLCHAIN_ARTIFACT")
onnx_folder=${artifact%.tar.*}

cd "$MOZ_FETCHES_DIR/onnxruntime"

###
# Various patches

# Make sure we use dependencies from onnxruntime-deps and avoid re-downloading
# them.
sed -i -e "s,;.*/,;$onnxruntime_depdir/,g"  cmake/deps.txt

# Apply local patches
find $GECKO_PATH/taskcluster/scripts/misc/onnxruntime.patches -type f -name '*.patch' -print0 | sort -z | while read -d '' patch ; do patch -p1 < $patch ; done

if test "$target_platform" = Linux; then
    # Linking libstdc++ statically needs __cxa_thread_atexit_impl, which would
    # pull in GLIBC_2.18. See the source for the details. Build it as part of the
    # shared library rather than separately, so that it gets the same flags as
    # the rest of it. onnxruntime attaches its dummy __cxa_demangle to the
    # library the same way.
    cat >> cmake/onnxruntime.cmake <<EOF
target_sources(onnxruntime PRIVATE "$GECKO_PATH/taskcluster/scripts/misc/onnxruntime-thread-atexit.cpp")
EOF
fi

###
# Configure and build
onnx_builddir=_build

mkdir $onnx_builddir

build_type=MinSizeRel

python3 tools/ci_build/build.py \
    --no_telemetry \
    --update \
    --parallel \
    --enable_lto \
    --disable_rtti \
    --cmake_generator Ninja \
    --build_dir $onnx_builddir \
    --build --build_shared_lib \
    --skip_submodule_sync --use_lock_free_queue --skip_tests --config $build_type --compile_no_warning_as_error \
    --cmake_extra_defines onnxruntime_BUILD_UNIT_TESTS=OFF\
    --cmake_extra_defines PYTHON_EXECUTABLE=$(which python3)\
    --cmake_extra_defines ONNX_USE_LITE_PROTO=ON\
    --disable_exceptions \
    --cmake_extra_defines CMAKE_C_FLAGS_INIT="$HARDENING_FLAGS $TARGET_FLAGS"\
    --cmake_extra_defines CMAKE_CXX_FLAGS_INIT="$HARDENING_FLAGS $TARGET_FLAGS $EXTRA_CXX_FLAGS"\
    "${extra_args[@]}"

telemetry_setting=$(sed -n 's/^onnxruntime_USE_TELEMETRY:[^=]*=//p' "$onnx_builddir/$build_type/CMakeCache.txt")
if [ "$telemetry_setting" != "OFF" ]; then
    echo "ERROR: onnxruntime_USE_TELEMETRY is '$telemetry_setting', expected OFF" >&2
    exit 1
fi

###
# Pack the result and upload.
mkdir $onnx_folder
cp $onnx_builddir/$build_type/${prefix}onnxruntime.${extension} $onnx_folder/

# The architecture names the tasks pass are platform-specific and don't match the names
# llvm-readobj reports, so map each one to the Arch: value it should produce.
case $target_arch in
    x86) expected_arch=i386 ;;
    x64|x86_64) expected_arch=x86_64 ;;
    aarch64|arm64|arm64-v8a) expected_arch=aarch64 ;;
    armeabi-v7a) expected_arch=arm ;;
    *)
        echo "ERROR: no expected architecture declared for $target_platform $target_arch" >&2
        exit 1
        ;;
esac
built_arch=$(llvm-readobj --file-headers "$onnx_folder/${prefix}onnxruntime.${extension}" | awk '/^Arch:/ {print $2}')
if [ -z "$built_arch" ]; then
    echo "ERROR: could not read the architecture of ${prefix}onnxruntime.${extension}" >&2
    exit 1
fi
if [ "$built_arch" != "$expected_arch" ]; then
    echo "ERROR: built $built_arch, expected $expected_arch for $target_arch" >&2
    exit 1
fi

ls -la "$onnx_folder"

find "$onnx_folder" -type f -exec llvm-strip -x {} \;  || true

ls -la "$onnx_folder"
mkdir -p $UPLOAD_DIR

export ZSTD_CLEVEL=19

case ${target_platform} in
    Windows)
        tar -a -c -f "$UPLOAD_DIR/$artifact" --force-local "$onnx_folder"
        ;;
    *)
        tar acf "$UPLOAD_DIR/$artifact" "$onnx_folder"
        ;;
esac
ls -la "$UPLOAD_DIR/$artifact"
