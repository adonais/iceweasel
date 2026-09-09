#!/bin/bash
set -x -e -v

# This script is for repacking rust-analyzer from GitHub releases.
# Instead of a single compressed file rust-analyzer.gz, we want a compressed .tar.zst archive.

mkdir -p rust-analyzer/bin
gunzip -c "$MOZ_FETCHES_DIR/rust-analyzer.gz" > rust-analyzer/bin/rust-analyzer
chmod +x rust-analyzer/bin/rust-analyzer

mkdir -p "$UPLOAD_DIR"
tar caf "$UPLOAD_DIR"/rust-analyzer.tar.zst rust-analyzer
