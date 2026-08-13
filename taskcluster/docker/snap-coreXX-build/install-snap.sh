#!/bin/bash

set -ex

SNAP_TO_INSTALL=$1
SNAP_BRANCH=$2

if [ -z "${SNAP_TO_INSTALL}" ]; then
  echo "Please give a snap name"
  exit 1
fi

if [ -z "${SNAP_BRANCH}" ]; then
  SNAP_BRANCH="stable"
fi

# Grab the requested snap from the desired channel and unpack it in the proper
# place (the 'Snap-CDN: none' header allows building in restricted network
# environments such as Launchpad builders)

SNAP_URL=$(curl -H 'X-Ubuntu-Series: 16' "https://api.snapcraft.io/api/v1/snaps/details/${SNAP_TO_INSTALL}?channel=${SNAP_BRANCH}" | jq '.download_url' -r)

# shellcheck disable=SC2046
curl -L -H 'Snap-CDN: none' "$SNAP_URL" --output "${SNAP_TO_INSTALL}.snap"

mkdir -p "/snap/${SNAP_TO_INSTALL}"

unsquashfs -d "/snap/${SNAP_TO_INSTALL}/current" "${SNAP_TO_INSTALL}.snap"

rm "${SNAP_TO_INSTALL}.snap"
