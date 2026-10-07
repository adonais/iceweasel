# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Check FFmpegLibWrapper against the symbols bundled ffvpx exports.

FFmpegLibWrapper resolves every libav* entry point by name at runtime, and the
AV_FUNC_OPTION/AV_FUNC_OPTION_SILENT variants leave the pointer null without
warning when the lookup fails. ffvpx only exports the names listed in its
.symbols files, so a wrapper entry naming a symbol ffvpx does not export is
silently dead whenever ffvpx is the backing library -- typically noticed only
as misbehaviour far away from the wrapper. Bumping ffvpx's major version is
the usual way to introduce one, because it moves entries into version masks
that were never exercised against ffvpx before.
"""

import pathlib
import re

from mozlint import result

WRAPPER = "dom/media/platforms/ffmpeg/FFmpegLibWrapper.cpp"
VERSION_MAJOR = "media/ffvpx/libavcodec/version_major.h"
SYMBOL_FILES = {
    "avcodec": "media/ffvpx/libavcodec/avcodec.symbols",
    "avutil": "media/ffvpx/libavutil/avutil.symbols",
}

# AV_FUNC(func, ver), optionally spread over several lines. The mask argument
# holds no unbalanced parentheses, so paren counting is enough to find the end.
ENTRY_RE = re.compile(
    r"\s*(AV_FUNC_OPTION_SILENT|AV_FUNC_OPTION|AV_FUNC)"
    r"\(\s*([A-Za-z_0-9]+)\s*,(.*)\)\s*;?\s*$"
)


def _error(config, path, lineno, message):
    return result.from_config(
        config, path=str(path), lineno=lineno, message=message, level="error"
    )


def _ffvpx_major(root):
    text = (root / VERSION_MAJOR).read_text()
    m = re.search(r"#define\s+LIBAVCODEC_VERSION_MAJOR\s+(\d+)", text)
    if not m:
        raise RuntimeError(f"No LIBAVCODEC_VERSION_MAJOR in {VERSION_MAJOR}")
    return int(m.group(1))


def _exported(root):
    """Map symbol name -> library that exports it.

    Preprocessor guards in the .symbols files are ignored on purpose: a name
    exported in only some configurations still means the wrapper entry is
    wired up, and treating it as exported keeps the lint free of false
    positives it cannot resolve without a full build configuration.
    """
    exported = {}
    for lib, relpath in SYMBOL_FILES.items():
        for line in (root / relpath).read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                exported[line] = lib
    return exported


def _entries(root):
    """Yield (lineno, kind, name, mask) for each AV_FUNC* entry in the wrapper."""
    text = (root / WRAPPER).read_text()
    body = text[
        text.index("AV_FUNC(av_lockmgr_register") : text.index("#undef AV_FUNC")
    ]
    offset = text[: text.index("AV_FUNC(av_lockmgr_register")].count("\n") + 1

    buf, start = "", 0
    for i, line in enumerate(body.splitlines()):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if not buf:
            start = i
        buf += " " + stripped
        if buf.count("(") and buf.count("(") == buf.count(")"):
            m = ENTRY_RE.match(buf)
            if m:
                yield offset + start, m.group(1), m.group(2), m.group(3)
            buf = ""


def _active(mask, major):
    return (
        f"AV_FUNC_{major}" in mask
        or f"AV_FUNC_AVUTIL_{major}" in mask
        or "AV_FUNC_AVCODEC_ALL" in mask
        or "AV_FUNC_AVUTIL_ALL" in mask
    )


def lint(paths, config, fix=None, **lintargs):
    root = pathlib.Path(lintargs["root"]).resolve()
    major = _ffvpx_major(root)
    exported = _exported(root)
    wrapper = root / WRAPPER

    results = []
    for lineno, kind, name, mask in _entries(root):
        if not _active(mask, major):
            continue

        # The macro picks the library to search from the AV_FUNC_AVUTIL_MASK
        # bit, so a mask that names the wrong family looks the symbol up in the
        # wrong handle.
        wants = "avutil" if "AVUTIL" in mask else "avcodec"
        holds = exported.get(name)

        if holds is None:
            results.append(
                _error(
                    config,
                    wrapper,
                    lineno,
                    f"{name} is bound for libavcodec {major}, which is the "
                    f"version bundled ffvpx provides, but ffvpx does not export "
                    f"it. {kind} leaves the pointer null, so every call site is "
                    f"dead when running on ffvpx. Add {name} to "
                    f"{SYMBOL_FILES[wants]}, or drop AV_FUNC_{major} from the "
                    f"mask if the entry is meant for system FFmpeg only.",
                )
            )
        elif holds != wants:
            results.append(
                _error(
                    config,
                    wrapper,
                    lineno,
                    f"{name} is exported by {holds}, but its mask uses the "
                    f"{wants} family, so the wrapper searches the {wants} "
                    f"handle for it. Use the "
                    f"AV_FUNC_{'AVUTIL_' if holds == 'avutil' else ''}<version> "
                    f"constants instead.",
                )
            )

    return results
