#!/bin/sh

set -ex

ARCH="$1"

git clone --no-checkout --depth=1 --branch=v1.25.15 https://github.com/chainguard-forks/kaniko .
git checkout 93345f1a761ae0811e4e23dea197b7834e6305ab
if [ "$ARCH" = arm64 ]; then
    make GOARCH=arm64
else
    make
fi
