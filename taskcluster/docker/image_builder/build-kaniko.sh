#!/bin/sh

set -ex

ARCH="$1"

git clone --no-checkout --depth=1 --branch=v1.25.0 https://github.com/chainguard-dev/kaniko .
git checkout 37afb27d847300f5baeef648b0bafcf31e35a178
if [ "$ARCH" = arm64 ]; then
    make GOARCH=arm64
else
    make
fi
