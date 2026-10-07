#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Invoked by `./mach vendor other-licenses/snappy/moz.yaml`: stamps the new release
# into snappy-stubs-public.h and the SNAPPY_VERSION static_asserts of its consumers.
import re
import sys
from pathlib import Path

major, minor, patch = (int(x) for x in sys.argv[1].split("."))
here = Path(__file__).resolve().parent
topsrcdir = here.parents[1]

stubs = here / "snappy-stubs-public.h"
text = stubs.read_text()
for name, value in (("MAJOR", major), ("MINOR", minor), ("PATCHLEVEL", patch)):
    text, n = re.subn(rf"^#define SNAPPY_{name} \d+$", f"#define SNAPPY_{name} {value}", text, flags=re.M)
    assert n == 1, name
stubs.write_text(text)

version = f"0x{major:02x}{minor:02x}{patch:02x}"
for rel in (
    "dom/cache/FileUtils.cpp",
    "dom/indexedDB/ActorsParentCommon.cpp",
    "dom/localstorage/SnappyUtils.cpp",
):
    path = topsrcdir / rel
    text, n = re.subn(r"static_assert\(SNAPPY_VERSION == 0x[0-9a-fA-F]+\);", f"static_assert(SNAPPY_VERSION == {version});", path.read_text())
    assert n == 1, rel
    path.write_text(text)
