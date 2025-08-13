#!/bin/bash

# After this point:
# * eE: All commands should succeed.
# * u: All variables should be defined before use.
# * o pipefail: All stages of all pipes should succeed.
set -eEuo pipefail

FILES=`ack -lw current_cpu | sort \
       | grep -v "BUILDCONFIG\.gn" \
       | grep -v "v8_target_cpu\.gni"`

echo $"
Bug 1775143 - pt14 - (mirror) 58f47eacaf10 r=ng

Search third_party/libwebrtc/build for current_cpu, removing
   third_party/libwebrtc/build/config/BUILDCONFIG.gn
   and
   third_party/libwebrtc/build/config/v8_target_cpu.gni from the list.

ack -lw current_cpu third_party/libwebrtc/build | grep -v \"BUILDCONFIG\.gn\" | grep -v \"v8_target_cpu\.gni\"

That gave me this:" > $TMP_DIR/commit_msg.txt

for FILE in $FILES; do
    sed -i'.bak' 's/current_cpu/target_cpu/g' $FILE
    echo "sed -i 's/current_cpu/target_cpu/g' third_party/libwebrtc/build/$FILE" >> $TMP_DIR/commit_msg.txt
    find . -name "*.bak" | xargs rm
done

echo $"

(skip-generation)

Depends on D149827

Differential Revision: https://phabricator.services.mozilla.com/D149828
Mercurial Revision: https://hg.mozilla.org/mozilla-central/rev/ec13234e5a641a026e946425ddea2d0de86435cd

" >> $TMP_DIR/commit_msg.txt

git commit -F $TMP_DIR/commit_msg.txt -a
