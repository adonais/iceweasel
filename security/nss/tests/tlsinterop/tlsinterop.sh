#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

########################################################################
#
# tests/tlsinterop/tlsinterop.sh
#
# Script to drive the tls interop tests
#
########################################################################

tlsinterop_init()
{
  SCRIPTNAME="tlsinterop.sh"
  if [ -z "${INIT_SOURCED}" -o "${INIT_SOURCED}" != "TRUE" ] ; then
    cd ../common
    . ./init.sh
  fi

  gnutls-cli --version
  openssl version

  export PATH=$BINDIR:$PATH
  export SERVER_UTIL=${BINDIR}/selfserv
  export CLIENT_UTIL=${BINDIR}/tstclnt
  export STRSCLNT_UTIL=${BINDIR}/strsclnt

  cd ${HOSTDIR}
  TLSINTEROP=${TLSINTEROP:=tlsinterop}
  REF="d787d1650619701113528535aec382c575cdead8"
  if [ ! -d "$TLSINTEROP" ]; then
    ${QADIR}/../fuzz/config/git-copy.sh https://gitlab.com/redhat-crypto/tests/interop/ $REF "$TLSINTEROP"
  fi

  cd ${HOSTDIR}/${TLSINTEROP}
  echo "list tests"
  tmt tests ls -f 'tag:interop-nss' -f 'tag:-interop-nss-broken'
  echo "discover tests"
  tmt run plan -n interop tests -f 'tag:interop-nss' -f 'tag:-interop-nss-broken' discover -v

  html_head "tlsinterop test"
}

tlsinterop_cleanup()
{
  cd ${QADIR}
  . common/cleanup.sh
}

tlsinterop_run_tests()
{
  extra_arg=""
  if [[ -n $1 ]]; then
      extra_arg="-f 'tag:interop-$1'"
  fi
  cd ${HOSTDIR}/${TLSINTEROP}
  eval tmt tests ls -f 'tag:interop-nss' -f 'tag:-interop-nss-broken' $extra_arg
  for t in $(eval tmt tests ls -f 'tag:interop-nss' -f 'tag:-interop-nss-broken' $extra_arg); do
    # The NSS tools live in $BINDIR, not a standard install path the interop
    # tests search, so pass them explicitly. PATH puts $BINDIR first so tools the
    # interop scripts invoke unqualified (e.g. certutil) resolve to the build
    # under test rather than the image's system libnss3-tools -- important for
    # ASan builds, where a system certutil loading the ASan libnss/libnspr fails
    # with undefined __asan_* symbols. LD_LIBRARY_PATH lets the tools load the
    # freshly-built NSS shared libraries. tmt does not inherit the caller's
    # environment into the test, so exporting these is not enough.
    tmt run -av \
        --environment CLIENT_UTIL="$CLIENT_UTIL" \
        --environment SERVER_UTIL="$SERVER_UTIL" \
        --environment STRSCLNT_UTIL="$STRSCLNT_UTIL" \
        --environment PATH="$PATH" \
        --environment LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
        plans -n interop provision -h local --feeling-safe execute -h tmt --interactive tests -n "$t"
    html_msg $? 0 "tlsinterop" "$t"
  done
}

