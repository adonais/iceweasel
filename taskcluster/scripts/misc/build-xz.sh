#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

set -e
set -x

# Required fetch artifact
xz_src=${MOZ_FETCHES_DIR}/xz-source

export PATH="${MOZ_FETCHES_DIR}/clang/bin:${PATH}"

target=$1
case "$target" in
    aarch64-apple-darwin)
        export MACOSX_DEPLOYMENT_TARGET=11.0
        ;;
    x86_64-apple-darwin)
        export MACOSX_DEPLOYMENT_TARGET=10.15
        ;;
    *)
        echo "ERROR: unsupported target $target" >&2
        exit 1
        ;;
esac

CC="clang -fuse-ld=lld --target=${target} -isysroot ${MOZ_FETCHES_DIR}/MacOSX26.5.sdk -Wno-unused-command-line-argument"

# Actual build
work_dir=`pwd`
dest_dir=${work_dir}/tmp-install
tardir=xz

cd `mktemp -d`
${xz_src}/configure --prefix=/${tardir} --host=${target} CC="${CC}" LD=${MOZ_FETCHES_DIR}/clang/bin/ld64.lld AR=llvm-ar RANLIB=llvm-ranlib CFLAGS=-O2 || { exit_status=$? && cat config.log && exit $exit_status ; }
export MAKEFLAGS=-j`nproc`
make
make DESTDIR=${dest_dir} install
cd ${dest_dir}

$GECKO_PATH/taskcluster/scripts/misc/pack.sh ${tardir}
