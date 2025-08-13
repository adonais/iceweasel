#!/bin/sh

set -ex

ARCH="$1"

git clone --no-checkout --depth=1 --branch=v1.19.0 https://github.com/containers/skopeo .
git checkout 7aa78df96b049bc9e36e10283ba08ceb9165041d
export GO111MODULE=on CGO_ENABLED=0
if [ "$ARCH" = arm64 ]; then
    export GOARCH=arm64
fi

# Set unixTempDirForBigFiles so skopeo will extract in a directory hidden by kaniko
go build \
        -mod=vendor -o out/skopeo \
        -tags "exclude_graphdriver_devicemapper exclude_graphdriver_btrfs containers_image_openpgp" \
        -ldflags '-X github.com/containers/image/v5/internal/tmpdir.unixTempDirForBigFiles=/workspace/tmp -X github.com/containers/image/v5/signature.systemDefaultPolicyPath=/kaniko/containers/policy.json -extldflags "-static" -w -s' \
        ./cmd/skopeo
