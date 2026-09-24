#!/usr/bin/env bash

if [[ $(id -u) -eq 0 ]]; then
    # Drop privileges by re-running this script.
    # Note: this mangles arguments, better to avoid running scripts as root.
    exec su worker -c "$0 $*"
fi

set -e -x

# Check that the vendored HACL*, karamel and libcrux code under lib/freebl/ is
# still what upstream produces at the pinned revisions.
#
# All three trees are vendored byte-identically -- their .clang-format files set
# DisableFormat, so NSS never reformats them -- which makes this check a plain
# `diff` against upstream. (It used to clang-format both sides first, which made
# the result depend on the clang-format version in the CI image.)

export HACL_STAR=~/hacl-star
export KARAMEL=~/karamel
export LIBCRUX=~/libcrux

HACL_STAR_REV=0f136f28935822579c244f287e1d2a1908a7e552
KARAMEL_REV=80f5435f2fc505973c469a4afcc8d875cddd0d8b
LIBCRUX_REV=87eda899b207aa8fecbdf7a6ecfa5f70a9b2c68c

clone() { # clone <url> <dir> <rev>
    git clone -q "$1" "$2"
    git -C "$2" checkout -q "$3"
}

clone https://github.com/hacl-star/hacl-star "${HACL_STAR}" "${HACL_STAR_REV}"
clone https://github.com/FStarLang/karamel "${KARAMEL}" "${KARAMEL_REV}"
clone https://github.com/cryspen/libcrux "${LIBCRUX}" "${LIBCRUX_REV}"

# NSS-local changes to the HACL* snapshot. See the patch headers for why.
for patch in "${VCS_PATH}"/nss/automation/taskcluster/scripts/patches/*.patch; do
    git -C "${HACL_STAR}" apply "${patch}"
done

# Files under lib/freebl/verified/ that have no upstream counterpart: config.h
# is an NSS placeholder, and P-384/P-521 are generated out of band.
hacl_local_only=(
    "config.h"
    "Hacl_P384.c"
    "Hacl_P384.h"
    "Hacl_P521.c"
    "Hacl_P521.h"
)

# Ed25519 is taken from the gcc-compatible dist; everything else that isn't
# karamel comes from the mozilla dist. TODO(Bug 1899443): drop this split.
hacl_from_gcc=(
    "Hacl_Ed25519.c"
    "Hacl_Ed25519.h"
    "internal/Hacl_Ed25519.h"
    "internal/Hacl_Ed25519_PrecompTable.h"
)

# hacl_upstream <path relative to lib/freebl/verified/>
# Prints the upstream path to compare against, or returns 1 if there is none.
hacl_upstream() {
    local rel="$1" f
    for f in "${hacl_local_only[@]}"; do
        if [[ "${rel}" == "${f}" ]]; then
            return 1
        fi
    done
    for f in "${hacl_from_gcc[@]}"; do
        if [[ "${rel}" == "${f}" ]]; then
            echo "${HACL_STAR}/dist/gcc-compatible/${rel}"
            return 0
        fi
    done
    # karamel/ mirrors the karamel repo, not hacl-star's bundled copy of it.
    case "${rel}" in
        karamel/include/*)
            echo "${KARAMEL}/include/${rel#karamel/include/}" ;;
        karamel/krmllib/dist/minimal/*)
            echo "${KARAMEL}/krmllib/dist/minimal/${rel#karamel/krmllib/dist/minimal/}" ;;
        *)
            echo "${HACL_STAR}/dist/mozilla/${rel}" ;;
    esac
}

# vendored_files <dir> -- every vendored file, as a path relative to <dir>.
vendored_files() {
    (cd "$1" && find . -type f ! -name '.clang-format' ! -name 'README.md' \
        -printf '%P\n' | sort)
}

# check <upstream file> <vendored file>
# A vendored file with no upstream counterpart is an error in its own right: it
# means something was added here without being taught to the mapping above.
check() {
    if [[ ! -f "$1" ]]; then
        echo "error: $2 has no upstream counterpart at $1" 1>&2
        status=1
    else
        diff -u "$1" "$2" || status=1
    fi
}

# Report every difference rather than stopping at the first, then fail at the
# end. Tracing is off from here so that the diffs are the only thing in the log.
set +x
status=0

hacl_dir="${VCS_PATH}/nss/lib/freebl/verified"
echo "checking lib/freebl/verified against hacl-star and karamel ..."
while read -r rel; do
    if upstream=$(hacl_upstream "${rel}"); then
        check "${upstream}" "${hacl_dir}/${rel}"
    fi
done < <(vendored_files "${hacl_dir}")

# The vendored libcrux tree mirrors the layout of upstream combined_extraction/c
# one-for-one, so it needs no mapping. See lib/freebl/libcrux/README.md.
libcrux_dir="${VCS_PATH}/nss/lib/freebl/libcrux"
echo "checking lib/freebl/libcrux against libcrux ..."
while read -r rel; do
    check "${LIBCRUX}/combined_extraction/c/${rel}" "${libcrux_dir}/${rel}"
done < <(vendored_files "${libcrux_dir}")

exit "${status}"
