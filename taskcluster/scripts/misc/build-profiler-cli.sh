#!/bin/bash
set -x -e -v

ARTIFACT="profiler-cli"
YARN_VERSION="1.22.22"

export PATH="$PATH:$MOZ_FETCHES_DIR/node/bin"
npm install -g yarn@$YARN_VERSION # Use yarn version >1.10

cd $MOZ_FETCHES_DIR/profiler
yarn install
yarn build-cli
# `yarn build-cli` doesn't fail when the build does.
test -f profiler-cli/dist/profiler-cli.js

STAGE=$(mktemp -d)
mkdir -p "$STAGE/$ARTIFACT/dist"
cp profiler-cli/package.json "$STAGE/$ARTIFACT/"
cp profiler-cli/dist/profiler-cli.js profiler-cli/dist/mappings.wasm "$STAGE/$ARTIFACT/dist/"

mkdir -p "$UPLOAD_DIR"
tar -C "$STAGE" -acf "$UPLOAD_DIR/$ARTIFACT.tar.zst" "$ARTIFACT"
