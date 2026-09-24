#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# This script builds openssl, used as a private dependency of the taskcluster
# python interpreter on macOS (build-cpython.sh) where the worker doesn't ship
# a matching libssl.

set -e
set -x

clang_bindir=${MOZ_FETCHES_DIR}/clang/bin
openssl_src=${MOZ_FETCHES_DIR}/openssl-source

export PATH=${clang_bindir}:${PATH}
export CC=clang

case `uname -m` in
    arm64 | aarch64)
        macosx_version_min=11.0
        openssl_target=darwin64-arm64-cc
        ;;
    *)
        macosx_version_min=10.15
        openssl_target=darwin64-x86_64-cc
        ;;
esac

sysroot_flags="-isysroot ${MOZ_FETCHES_DIR}/MacOSX26.5.sdk -mmacosx-version-min=${macosx_version_min}"
export CFLAGS=${sysroot_flags}
export LDFLAGS="-fuse-ld=lld ${sysroot_flags}"

work_dir=`pwd`
tardir=openssl

# The prefix is baked into the shared libraries' install names; build-cpython.sh
# relies on the resulting /openssl/lib/lib{ssl,crypto}.1.1.dylib references.
cd `mktemp -d`
${openssl_src}/Configure --prefix=/${tardir} --openssldir=/${tardir}/ssl shared no-tests ${openssl_target}

export MAKEFLAGS=-j`nproc`
make
make DESTDIR=${work_dir} install_sw
cd ${work_dir}

$(dirname $0)/pack.sh ${tardir}
