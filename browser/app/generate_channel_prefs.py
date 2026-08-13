# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Generate channel-prefs.js by substituting @MOZ_UPDATE_CHANNEL@.

The input has no preprocessor directives, so every line is written
verbatim and the preprocessor never emits a `//@line N "<path>"`
marker. The substitution filter then replaces `@MOZ_UPDATE_CHANNEL@`
in place.

channel-prefs.js is handled separately from other prefs due to bug 756325.

Byte stability of the installed file matters because the macOS updater
leaves `channel-prefs.js` alone after first install. Code signature
verification fails when an update arrives with different bytes than
the file that was signed (bug 1431342).

The comment at the top of `profile/channel-prefs.js` still points at
`browser/app/Makefile.in`. That pointer is intentionally stale because
updating the template's content would change its shipped bytes.

Adding a preprocessor directive to `profile/channel-prefs.js` would
reintroduce `//@line` markers, which `main` asserts against."""

import io

import buildconfig
from mozbuild.preprocessor import Preprocessor


def main(output, input_path):
    pp = Preprocessor()
    pp.do_filter("substitution")
    pp.context["MOZ_UPDATE_CHANNEL"] = buildconfig.substs["MOZ_UPDATE_CHANNEL"]
    result = io.StringIO()
    with open(input_path, encoding="utf-8") as fh:
        pp.processFile(fh, result)
    contents = result.getvalue()
    assert "//@line" not in contents, (
        f"{input_path} produced `//@line` markers; channel-prefs.js must be "
        "byte-stable for the macOS updater (bug 1431342)"
    )
    output.write(contents)
