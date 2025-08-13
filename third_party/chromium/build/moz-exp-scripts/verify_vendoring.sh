#!/bin/bash

# After this point:
# * eE: All commands should succeed.
# * u: All variables should be defined before use.
# * o pipefail: All stages of all pipes should succeed.
set -eEuo pipefail

echo "Verifying vendoring..."

./mach python dom/media/webrtc/third_party_build/vendor-libwebrtc.py \
    --from-local $REPO_PATH \
    --commit mozpatches build

hg revert \
   --include "**/moz.build" \
   --include "$DEST_PATH/README.mozilla.last-vendor" &> /dev/null

FILE_CHANGE_CNT=`hg status $DEST_PATH | wc -l | tr -d " "`
if [ "x$FILE_CHANGE_CNT" != "x0" ]; then
  echo "Changes were detected after vendoring"
  hg status | head
  exit 1
fi

echo "Done - vendoring has been verified."
