# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

#
# review_context_schema.py is a stdlib-only copy vendored verbatim (byte for
# byte) from the bugbug repository, so the tree validates against the same
# schema the review agent uses at runtime:
#
#     source: https://github.com/mozilla/bugbug
#     path:   bugbug/tools/code_review/review_context_schema.py
#     commit: f0ffae645331fecc93c3d177243c1630f7dd7d2d (plus an unlanded change
#             trimming the bugzilla product/keywords/severity and review author
#             predicates; bump this hash once that bugbug change lands)
#
# To re-sync, copy that file over the vendored copy (a plain `cp`; do not edit
# it in place, so `diff` against upstream stays meaningful) and update the
# commit above. Once bugbug publishes the schema as a standalone stdlib-only
# pypi package, replace the vendored copy with a pinned `pypi:` dependency in
# python/sites/lint.txt vendored via `mach vendor python`.

import os

from mozlint import result

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore

from python.review_context_schema import (
    LoadFileAction,
    ReviewContextValidationError,
    validate_review_context_file,
)


def lint(paths, config, **lintargs):
    root = lintargs["root"]
    results = []

    for path in paths:
        if os.path.isdir(path):
            continue
        try:
            review_context = validate_review_context_file(path)
        except (tomllib.TOMLDecodeError, ReviewContextValidationError) as exc:
            results.append(
                result.from_config(
                    config,
                    path=path,
                    message=str(exc),
                )
            )
            continue

        # Schema validation does not know about the local tree, so it cannot
        # tell whether a referenced file actually exists. A same-repo `file`
        # load that points at a missing path fails silently at review time
        # (the loader logs and skips it), so flag it here instead.
        for rule in review_context.rules:
            for action in rule.load:
                if not isinstance(action, LoadFileAction) or action.repo is not None:
                    continue
                if not os.path.isfile(os.path.join(root, action.path)):
                    results.append(
                        result.from_config(
                            config,
                            path=path,
                            message=(
                                f"rule {rule.name!r} loads missing file {action.path!r}"
                            ),
                        )
                    )

    return results
