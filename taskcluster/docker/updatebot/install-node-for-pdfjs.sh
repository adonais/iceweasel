#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script installs Node v24 LTS for PDF.js
# This is different from the nodejs used in the toolchain, but hopefully that won't be an issue

wget -O node.xz --progress=dot:mega https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.xz
echo '2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2' node.xz | sha256sum -c
tar -C /usr/local -xJ --strip-components 1 < node.xz
node -v  # verify
npm -v
