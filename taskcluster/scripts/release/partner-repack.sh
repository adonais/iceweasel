#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -x -e -v -o pipefail

: GECKO_PATH                    "${GECKO_PATH:?}"
: REPACK_MANIFESTS_URL          "${REPACK_MANIFESTS_URL:?}"
: UPSTREAM_TASKIDS              "${UPSTREAM_TASKIDS:?}"
: RELEASE_TYPE                  "${RELEASE_TYPE:?}"
: REPACK_VERSION                "${REPACK_VERSION:?}"
: REPACK_BUILD_NUMBER           "${REPACK_BUILD_NUMBER:?}"
: REPACK_PLATFORM               "${REPACK_PLATFORM:?}"
: REPACK_PARTNERS               "${REPACK_PARTNERS:=}"
: REPACK_LIMIT_LOCALES          "${REPACK_LIMIT_LOCALES:=}"
: WORKSPACE                     "${WORKSPACE:=/builds/worker/workspace}"
: REPO_TOOL_URL                 "${REPO_TOOL_URL:=https://raw.githubusercontent.com/mozilla-releng/git-repo/main/repo}"
: MOZ_SCM_LEVEL                 "${MOZ_SCM_LEVEL:=1}"

SSH_KEY=/builds/partner-github-ssh

if [[ "$REPACK_MANIFESTS_URL" == git@* ]]; then
    SECRET_URL="${TASKCLUSTER_PROXY_URL:-http://taskcluster}/secrets/v1/secret/project/releng/gecko/build/level-${MOZ_SCM_LEVEL}/partner-github-ssh"
    (umask 077; curl -sSf "$SECRET_URL" | python3 -c 'import json, sys; sys.stdout.write(json.load(sys.stdin)["secret"]["content"])' > "$SSH_KEY")
    chmod 0600 "$SSH_KEY"
    export GIT_SSH_COMMAND="ssh -oIdentityFile=$SSH_KEY"
fi

mkdir -p "$WORKSPACE"
cd "$WORKSPACE"
curl -sSfL -o repo "$REPO_TOOL_URL"
chmod 0755 repo

synced=
for attempt in 1 2 3 4 5; do
    rm -rf .repo partners
    if python3 repo init --no-repo-verify -u "$REPACK_MANIFESTS_URL" \
        && python3 repo sync --current-branch --no-tags; then
        synced=1
        break
    fi
    echo "repo init/sync attempt $attempt failed"
    sleep 5
done
if [[ -z "$synced" ]]; then
    echo "repo init/sync failed after 5 attempts"
    exit 1
fi

args=(-v "$REPACK_VERSION" -n "$REPACK_BUILD_NUMBER" --platform "$REPACK_PLATFORM")
for partner in $REPACK_PARTNERS; do
    args+=(--partner "$partner")
done
for locale in $REPACK_LIMIT_LOCALES; do
    args+=(--limit-locale "$locale")
done
for taskid in $UPSTREAM_TASKIDS; do
    args+=(--taskid "$taskid")
done

cd "$GECKO_PATH"
./mach python python/mozrelease/mozrelease/partner_repack.py "${args[@]}"
