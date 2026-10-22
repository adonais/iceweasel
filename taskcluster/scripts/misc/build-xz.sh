#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

set -e
set -x

# Required fetch artifact
xz_src=${MOZ_FETCHES_DIR}/xz-source

target=$1
MACOS_TARGET=$target
. $GECKO_PATH/taskcluster/scripts/misc/macos-setup.sh

CC="${MACOS_CC} ${MACOS_CFLAGS}"

# Actual build
work_dir=`pwd`
dest_dir=${work_dir}/tmp-install
tardir=xz

cd `mktemp -d`
${xz_src}/configure --prefix=/${tardir} --host=${target} CC="${CC}" LD=${MACOS_LD} AR=${MACOS_AR} RANLIB=${MACOS_RANLIB} CFLAGS=-O2 || { exit_status=$? && cat config.log && exit $exit_status ; }
export MAKEFLAGS=-j`nproc`
make
make DESTDIR=${dest_dir} install
cd ${dest_dir}

$GECKO_PATH/taskcluster/scripts/misc/pack.sh ${tardir}
