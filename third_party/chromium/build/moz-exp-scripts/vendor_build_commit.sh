#!/bin/bash

# After this point:
# * eE: All commands should succeed.
# * u: All variables should be defined before use.
# * o pipefail: All stages of all pipes should succeed.
set -eEuo pipefail

echo "vendor the commit"
./mach python dom/media/webrtc/third_party_build/vendor-libwebrtc.py \
    --from-local $REPO_PATH \
    --commit mozpatches build
hg revert --include "**/moz.build" &> /dev/null
( cd $REPO_PATH \
  && echo "# base of lastest vendoring" >> $BASE_COMMIT_FILE \
  && git rev-parse --short `git merge-base mozpatches main` >> $BASE_COMMIT_FILE \
)


echo "commit the newly vendored changes"
hg status -nd | xargs hg rm
hg status -nu | xargs hg add
( NEW_BASE_SHA=`tail -1 $BASE_COMMIT_FILE` ; \
  hg commit -m "Bug $BUG_NUMBER - vendor chromium/build from $NEW_BASE_SHA" )


echo "save the new patch-stack"
./mach python dom/media/webrtc/third_party_build/save_patch_stack.py \
  --state-path "" \
  --repo-path $REPO_PATH \
  --branch mozpatches \
  --target-branch-head `tail -1 $BASE_COMMIT_FILE` \
  --patch-path $DEST_PATH/moz-patch-stack \
  --skip-startup-sanity \
  --separate-commit-bug-number $BUG_NUMBER

bash $SCRIPT_DIR/generate_build_files.sh

echo "done"
