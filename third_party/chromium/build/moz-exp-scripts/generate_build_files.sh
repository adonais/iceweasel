#!/bin/bash

# After this point:
# * eE: All commands should succeed.
# * u: All variables should be defined before use.
# * o pipefail: All stages of all pipes should succeed.
set -eEuo pipefail

function find_repo_type()
{
  if [ -d ".git" ]; then
      MOZ_REPO="git"
  elif [ -d ".hg" ]; then
      MOZ_REPO="hg"
  else
    echo "Unable to detect repo (git or hg)"
    exit 1
  fi
}

find_repo_type
echo "repo type: $MOZ_REPO"

WEBRTC_GEN_LOG_FILE=$TMP_DIR/log_webrtc_gen.txt
ABSEIL_GEN_LOG_FILE=$TMP_DIR/log_abseil_gen.txt

echo "generate libwebrtc moz.build files"
./mach python build/gn_processor.py \
    dom/media/webrtc/third_party_build/gn-configs/webrtc.json 2>&1| tee $WEBRTC_GEN_LOG_FILE
ERR_AND_WARN_CNT=`grep -Ei 'warning|error' $WEBRTC_GEN_LOG_FILE | wc -l | tr -d " " || true`
echo "ERR_AND_WARN_CNT: $ERR_AND_WARN_CNT"
if [ "x$ERR_AND_WARN_CNT" != "x0" ]; then
  echo "libwebrtc moz.build generation has errors or warnings"
  echo "see: $WEBRTC_GEN_LOG_FILE"
  exit 1
fi
if [ "x$MOZ_REPO" == "xgit" ]; then
  git status --short | grep "??" | awk '{ print $2; }' | xargs git add &> /dev/null || true
  git add -u
  git commit -m "Bug $BUG_NUMBER - update generated libwebrtc moz.build files" || true
else
  hg status -nd | xargs hg rm
  hg status -nu | xargs hg add
  hg commit -m "Bug $BUG_NUMBER - update generated libwebrtc moz.build files" || true
fi

echo "generate abseil-cpp moz.build files"
./mach python build/gn_processor.py \
    dom/media/webrtc/third_party_build/gn-configs/abseil.json 2>&1| tee $ABSEIL_GEN_LOG_FILE
ERR_AND_WARN_CNT=`grep -Ei 'warning|error' $ABSEIL_GEN_LOG_FILE | wc -l | tr -d " " || true`
echo "ERR_AND_WARN_CNT: $ERR_AND_WARN_CNT"
if [ "x$ERR_AND_WARN_CNT" != "x0" ]; then
  echo "abseil-cpp moz.build generation has errors or warnings"
  echo "see: $ABSEIL_GEN_LOG_FILE"
  exit 1
fi
if [ "x$MOZ_REPO" == "xgit" ]; then
  git status --short | grep "??" | awk '{ print $2; }' | xargs git add &> /dev/null || true
  git add -u
  git commit -m "Bug $BUG_NUMBER - update generated abseil-cpp moz.build files" || true
else
  hg status -nd | xargs hg rm
  hg status -nu | xargs hg add
  hg commit -m "Bug $BUG_NUMBER - update generated abseil-cpp moz.build files" || true
fi