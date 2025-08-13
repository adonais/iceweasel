#!/bin/bash

# After this point:
# * eE: All commands should succeed.
# * u: All variables should be defined before use.
# * o pipefail: All stages of all pipes should succeed.
set -eEuo pipefail

ack -l "\"//build/" | xargs sed -i.bak -E 's/\"\/\/build\//\"\/\/chromium\/build\//'
ack -l "\"//build:" | xargs sed -i.bak -E 's/\"\/\/build:/\"\/\/chromium\/build:/'
find . -name "*.bak" | xargs rm
git restore \
  android/pylib/utils/gold_utils.py \
  args/README.txt \
  args/chromeos/README.md \
  gn_helpers_unittest.py \
  locale_tool.py \
  toolchain/linux/unbundle/README.md

echo $"
Bug 1921707 - point to new build directory location in third_party/chromium/build r=ng,glandium

Ran:
ack -l \"\\\"//build/\" third_party/chromium/build | xargs sed -i.bak -E 's/\\\"\/\/build\//\\\"\/\/chromium\/build\//'
ack -l \"\\\"//build:\" third_party/chromium/build | xargs sed -i.bak -E 's/\\\"\/\/build:/\\\"\/\/chromium\/build:/'
find third_party -name \"*.bak\" | xargs rm
hg revert \\
  third_party/chromium/build/android/pylib/utils/gold_utils.py \\
  third_party/chromium/build/args/README.txt \\
  third_party/chromium/build/args/chromeos/README.md \\
  third_party/chromium/build/gn_helpers_unittest.py \\
  third_party/chromium/build/locale_tool.py \\
  third_party/chromium/build/toolchain/linux/unbundle/README.md

Differential Revision: https://phabricator.services.mozilla.com/D224542
Mercurial Revision: https://hg.mozilla.org/mozilla-central/rev/6b855a2bf6b1f3feb9c6558a9357fed8e43c5b99

" > $TMP_DIR/commit_msg.txt

git commit -F $TMP_DIR/commit_msg.txt -a
