#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script installs Node v22 LTS for PDF.js
# This is different from the nodejs used in the toolchain, but hopefully that won't be an issue

wget -O node.xz --progress=dot:mega https://nodejs.org/dist/v22.17.0/node-v22.17.0-linux-x64.tar.xz
echo '325c0f1261e0c61bcae369a1274028e9cfb7ab7949c05512c5b1e630f7e80e12' node.xz | sha256sum -c
tar -C /usr/local -xJ --strip-components 1 < node.xz
node -v  # verify
npm -v
