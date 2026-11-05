#!/bin/bash
set -x -e -v

# This script is for repacking Node (and NPM) from nodejs.org.

mkdir -p "$UPLOAD_DIR"

cd "$MOZ_FETCHES_DIR"

tar caf "$UPLOAD_DIR"/node.tar.zst node
