#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# This script regenerates imported/special-case.cc.
#
# In V8, special-case.cc is generated at build time by
# gen-regexp-special-case.cc. Its contents only change when the
# generator changes or when ICU is updated to a new version of Unicode,
# so instead of adding a step to our build, we check in the output and
# regenerate it manually when necessary.
#
# The output depends on the Unicode data in ICU, so the generator is
# linked against the in-tree ICU objects from an existing build.
#
# Usage:
#  cd path/to/js/src/irregexp
#  ./update-special-case.py --objdir path/to/objdir
#
# The objdir must be a native (not cross-compiled) build that has
# already built ICU. A JS shell build is sufficient.

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

# Keep in sync with config/external/icu/defs.mozbuild. The
# UNISTR_FROM_*_EXPLICIT defines are omitted because the generator
# relies on implicit conversions to UnicodeString. They only affect
# the headers, so this doesn't change the behaviour of ICU.
ICU_DEFINES = [
    "U_USING_ICU_NAMESPACE=0",
    "U_NO_DEFAULT_INCLUDE_UTF_HEADERS=1",
    "U_HIDE_OBSOLETE_UTF_OLD_H=1",
    "UCONFIG_NO_LEGACY_CONVERSION",
    "UCONFIG_NO_TRANSLITERATION",
    "UCONFIG_NO_REGULAR_EXPRESSIONS",
    "UCONFIG_NO_BREAK_ITERATION",
    "UCONFIG_NO_IDNA",
    "UCONFIG_NO_MF2",
    "UCONFIG_NO_NORMALIZATION",
    "UCONFIG_NO_COLLATION",
    "U_CHARSET_IS_UTF8",
    "U_ENABLE_DYLOAD=0",
]

# The generator includes special-case.h, which pulls in the shim. It
# only needs a few definitions from it, so we substitute this stub.
STUB_HEADER = """\
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "unicode/uniset.h"

#define CHECK(x)                                  \\
  do {                                            \\
    if (!(x)) {                                   \\
      std::cerr << "CHECK failed: " #x << "\\n"; \\
      std::abort();                               \\
    }                                             \\
  } while (0)
#define CHECK_EQ(a, b) CHECK((a) == (b))
#define CHECK_LE(a, b) CHECK((a) <= (b))

namespace v8::internal::base {
using uc32 = uint32_t;
}
"""

INCLUDE_REWRITES = [
    ('#include "src/base/lazy-instance.h"\n\n', ""),
    (
        '#include "src/regexp/special-case.h"',
        '#include "irregexp/imported/special-case.h"',
    ),
]


def read_subst(objdir, name):
    path = objdir / "config.statusd" / "substs" / name
    if not path.exists():
        return None
    text = path.read_text().strip()
    return json.loads(text) if text else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--objdir", required=True, type=Path, help="objdir of an existing build"
    )
    args = parser.parse_args()

    irregexp_dir = Path(__file__).resolve().parent
    topsrcdir = irregexp_dir.parents[2]
    objdir = args.objdir.resolve()

    if read_subst(objdir, "CROSS_COMPILE"):
        sys.exit(f"{objdir} is a cross-compiled build")

    cxx = read_subst(objdir, "CXX")
    if not cxx:
        sys.exit(f"Could not find CXX in {objdir}. Has it been configured?")
    if isinstance(cxx, str):
        cxx = cxx.split()

    icu_objdir = objdir / "config" / "external" / "icu"
    icu_objects = sorted((icu_objdir / "common").glob("*.o"))
    icu_objects += sorted((icu_objdir / "i18n").glob("*.o"))
    icu_data = icu_objdir / "data" / "icu_data.o"
    if not icu_objects or not icu_data.exists():
        sys.exit(f"Could not find ICU objects in {icu_objdir}. Build it first.")

    icu_src = topsrcdir / "intl" / "icu" / "source"
    generator = irregexp_dir / "imported" / "gen-regexp-special-case.cc"
    output = irregexp_dir / "imported" / "special-case.cc"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        stub_dir = tmp / "stub"
        (stub_dir / "irregexp" / "imported").mkdir(parents=True)
        (stub_dir / "irregexp" / "imported" / "special-case.h").write_text(STUB_HEADER)

        gen_binary = tmp / "gen-regexp-special-case"
        cmd = cxx + ["-O1", "-frtti"]
        cmd += [f"-D{d}" for d in ICU_DEFINES]
        cmd += [
            f"-I{stub_dir}",
            f"-I{icu_src / 'common'}",
            f"-I{icu_src / 'i18n'}",
            str(generator),
        ]
        cmd += [str(o) for o in icu_objects + [icu_data]]
        cmd += ["-lpthread", "-ldl", "-o", str(gen_binary)]
        subprocess.run(cmd, check=True)

        generated = tmp / "special-case.cc"
        subprocess.run([str(gen_binary), str(generated)], check=True)
        text = generated.read_text()

    for old, new in INCLUDE_REWRITES:
        if old not in text:
            sys.exit(f"Generated file does not contain expected text: {old!r}")
        text = text.replace(old, new)

    output.write_text(text)
    print(f"Updated {output.relative_to(topsrcdir)}")


if __name__ == "__main__":
    main()
