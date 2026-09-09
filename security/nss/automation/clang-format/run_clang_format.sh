#!/usr/bin/env bash

if [[ $(id -u) -eq 0 ]]; then
    # Drop privileges by re-running this script.
    # Note: this mangles arguments, better to avoid running scripts as root.
    exec su worker -c "$0 $*"
fi

set -e

# The clang-format version CI formats the tree with. Keep this in sync with
# CLANG_VERSION in taskcluster/docker/clang-format/Dockerfile. It is not
# packaged by any distribution -- see that directory's llvm.sources for the
# apt repo, or just use `./mach clang-format`, which runs the same image.
expected_version=22

# Warn, but don't stop: a wrong-version run is still more useful than no run,
# and the versions mostly agree. If the diff below looks surprising, start here.
found_version=$(clang-format --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)+' | head -1 | cut -d. -f1)
if [[ "$found_version" != "$expected_version" ]]; then
    echo "warning: found clang-format ${found_version:-of unknown version}, but CI uses clang-format ${expected_version}." 1>&2
    echo "warning: formatting may differ from what the CI check expects." 1>&2
fi

# Apply clang-format on the provided folder and verify that this doesn't change any file.
# If any file differs after formatting, the script eventually exits with 1.
# Any differences between formatted and unformatted files is printed to stdout to give a hint what's wrong.

# Includes a default set of directories NOT to clang-format on.
blocklist=(
     "./automation" \
     "./coreconf" \
     "./doc" \
     "./pkg" \
     "./tests" \
     "./lib/libpkix" \
     "./lib/zlib" \
     "./lib/sqlite" \
     "./gtests/google_test" \
     "./out" \
)

top=$(cd "$(dirname $0)/../.."; pwd -P)

if [ $# -gt 0 ]; then
    dirs=("$@")
else
    cd "$top"
    dirs=($(find . -maxdepth 2 -mindepth 1 -type d ! -path '*/.*' -print))
fi

format_folder()
{
    for block in "${blocklist[@]}"; do
        if [[ "$1" == "$block"* ]]; then
            echo "skip $1"
            return 1
        fi
    done
    return 0
}

for dir in "${dirs[@]}"; do
    if format_folder "$dir"; then
        c="${dir//[^\/]}"
        echo "formatting $dir ..."
        depth=()
        if [ "${#c}" == "1" ]; then
            depth+=(-maxdepth 1)
        fi
        find "$dir" "${depth[@]}" -type f \( -name '*.[ch]' -o -name '*.cc' \) -exec clang-format -sort-includes=false -i {} \+
    fi
done

TMPFILE=$(mktemp /tmp/$(basename $0).XXXXXX)
trap 'rm -f $TMPFILE' exit
if [[ -d "$top/.hg" ]]; then
    hg diff --git "$top" | tee $TMPFILE
else
    git -C "$top" diff | tee $TMPFILE
fi
[[ ! -s $TMPFILE ]]
