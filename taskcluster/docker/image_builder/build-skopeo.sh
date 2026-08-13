#!/bin/sh

set -ex

ARCH="$1"

git clone --no-checkout --depth=1 --branch=v1.23.0 https://github.com/podman-container-tools/skopeo .
git checkout 0215995053b78878f5491980d44311c2eb4bd3ed
export GO111MODULE=on CGO_ENABLED=0
if [ "$ARCH" = arm64 ]; then
    export GOARCH=arm64
fi

# Set unixTempDirForBigFiles so skopeo will extract in a directory hidden by kaniko
go build \
        -mod=vendor -o out/skopeo \
        -tags "exclude_graphdriver_btrfs containers_image_openpgp" \
        -ldflags '-X go.podman.io/image/v5/internal/tmpdir.unixTempDirForBigFiles=/workspace/tmp -extldflags "-static" -w -s' \
        ./cmd/skopeo
