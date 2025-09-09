#!/bin/sh
set -v -e -x

pip3 install --break-system-packages --no-cache-dir git+https://github.com/mozilla/reposado@3dd826dfd89c8a1224aecf381637aa0bf90a3a3c

python3 /usr/local/bin/repoutil --configure <<EOF
/opt/data-reposado/html/
/opt/data-reposado/metadata/
http://example.com/
EOF

pip3 install --break-system-packages --no-cache-dir -r /setup/requirements.txt

cd /
rm -rf /setup
