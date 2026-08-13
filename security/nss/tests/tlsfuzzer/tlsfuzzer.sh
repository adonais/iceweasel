#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

########################################################################
#
# tests/tlsfuzzer/tlsfuzzer.sh
#
# Script to drive the ssl tlsfuzzer interop unit tests
#
########################################################################

tlsfuzzer_certs()
{
  PROFILEDIR=`pwd`

  ${BINDIR}/certutil -N -d "${PROFILEDIR}" --empty-password 2>&1
  html_msg $? 0 "create tlsfuzzer database"

  pushd "${QADIR}"
  . common/certsetup.sh
  popd

  counter=0
  make_cert rsa rsa2048 sign kex
  make_cert rsa-pss rsapss sign kex
}

tlsfuzzer_init()
{
  SCRIPTNAME="tlsfuzzer.sh"
  if [ -z "${INIT_SOURCED}" -o "${INIT_SOURCED}" != "TRUE" ] ; then
    cd ../common
    . ./init.sh
  fi

  mkdir -p "${HOSTDIR}/tlsfuzzer"
  pushd "${HOSTDIR}/tlsfuzzer"
  tlsfuzzer_certs

  TLSFUZZER=${TLSFUZZER:=tlsfuzzer}
  # tlsfuzzer has no release tags, so pin a known-good (Python 3.12 compatible)
  # revision. Fetch it as a tarball and install its dependencies (tlslite-ng,
  # which pulls in ecdsa) from pip.
  TLSFUZZER_REV=bf7f579dc0e65498cfb21b60e9b152f6bd84a3bf
  if [ ! -d "$TLSFUZZER" ]; then
    curl -sSfL "https://github.com/tomato42/tlsfuzzer/archive/${TLSFUZZER_REV}.tar.gz" | tar xz
    mv "tlsfuzzer-${TLSFUZZER_REV}" "$TLSFUZZER"
    python3 -m pip install --break-system-packages -r "${TLSFUZZER}/requirements.txt"
  fi

  # Find usable port
  PORT=${PORT-8443}
  while true; do
    "${BINDIR}/selfserv" -w nss -d "${HOSTDIR}/tlsfuzzer" -n rsa \
			 -p "${PORT}" -i selfserv.pid &
    [ -f selfserv.pid ] || sleep 5
    if [ -f selfserv.pid ]; then
      kill $(cat selfserv.pid)
      wait $(cat selfserv.pid)
      rm -f selfserv.pid
      break
    fi
    PORT=$(($PORT + 1))
  done

  sed -e "s|@PORT@|${PORT}|g" \
      -e "s|@SELFSERV@|${BINDIR}/selfserv|g" \
      -e "s|@SERVERDIR@|${HOSTDIR}/tlsfuzzer|g" \
      -e "s|@HOSTADDR@|${HOSTADDR}|g" \
      ${QADIR}/tlsfuzzer/config.json.in > ${TLSFUZZER}/config.json
  popd

  SCRIPTNAME="tlsfuzzer.sh"
  html_head "tlsfuzzer test"
}

tlsfuzzer_cleanup()
{
  cd ${QADIR}
  . common/cleanup.sh
}

tlsfuzzer_run_tests()
{
  pushd "${HOSTDIR}/tlsfuzzer/${TLSFUZZER}"
  PYTHONPATH=. python3 tests/scripts_retention.py config.json "${BINDIR}/selfserv" 512
  html_msg $? 0 "tlsfuzzer" "Run successfully"
  popd
}

cd "$(dirname "$0")"
tlsfuzzer_init
tlsfuzzer_run_tests
tlsfuzzer_cleanup
