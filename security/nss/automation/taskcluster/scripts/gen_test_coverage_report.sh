#!/usr/bin/env bash

source $(dirname "$0")/tools.sh

cp -a "${VCS_PATH}/nss" .
"$(dirname "$0")/clone_nspr.sh"

pushd nspr
if [[ -f ../nss/nspr.patch && "$ALLOW_NSPR_PATCH" == "1" ]]; then
  cat ../nss/nspr.patch | patch -p1
fi
popd

out=/builds/worker/artifacts
mkdir -p $out

cd nss
export PYTHONUNBUFFERED=1
./mach test-coverage --outdir=$out --base-rev="$NSS_BASE_REV"
