# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil

import mozunit

LINTER = "extra-js-modules"
fixed = 0


MOZBUILD_RESULTS = (
    [
        (
            "sub/final/moz.build",
            3,
            "New files may not be added to EXTRA_PP_JS_MODULES: sub/final/NewPP.sys.mjs",
        ),
        (
            "sub/final/moz.build",
            7,
            "New files may not be added to FINAL_TARGET_FILES.modules: "
            "sub/final/NewFinalTarget.sys.mjs",
        ),
        (
            "sub/final/moz.build",
            11,
            "New files may not be added to FINAL_TARGET_PP_FILES.modules: "
            "sub/final/NewFinalTargetPP.sys.mjs",
        ),
        (
            "sub/globbed/moz.build",
            2,
            "New files may not be added to EXTRA_JS_MODULES: "
            "sub/globbed/NewGlobbed.sys.mjs",
        ),
        (
            "sub/moz.build",
            4,
            "New files may not be added to EXTRA_JS_MODULES: sub/New.sys.mjs",
        ),
        (
            "sub/moz.build",
            8,
            "New files may not be added to EXTRA_JS_MODULES: sub/NewNested.sys.mjs",
        ),
    ]
    + [
        (
            "sub/nonliteral/moz.build",
            lineno,
            "EXTRA_JS_MODULES values must be string literals in a list so they "
            "can be checked",
        )
        for lineno in (3, 5, 10)
    ]
    + [
        (
            "sub/targets/moz.build",
            2,
            "New files may not be added to EXTRA_JS_MODULES: "
            "sub/targets/MultiTarget.sys.mjs",
        ),
    ]
)

SYNTAX_ERROR_RESULT = (
    "sub/syntaxerror/moz.build",
    1,
    "Could not parse moz.build to check modules: '[' was never closed",
)

STALE_RESULT = (
    "allowlist.txt",
    7,
    "sub/Stale.sys.mjs is no longer installed as a module and should be "
    "removed from the allowlist",
)


def summarize(results, root):
    return [
        (os.path.relpath(r.path, root).replace(os.sep, "/"), r.lineno, r.message)
        for r in results
    ]


def test_lint_extra_js_modules(lint, paths, root, config):
    config = dict(config, allowlist="allowlist.txt")
    results = lint(paths(), config=config)
    assert summarize(results, root) == [STALE_RESULT, *MOZBUILD_RESULTS]


def test_lint_extra_js_modules_only_linted_paths(lint, paths, root, config):
    config = dict(config, allowlist="allowlist.txt")
    results = lint(paths("sub/nested/moz.build"), config=config)
    assert summarize(results, root) == [STALE_RESULT]


def test_lint_extra_js_modules_fix(lint, root, config, tmp_path):
    shutil.copytree(root, tmp_path, dirs_exist_ok=True)
    config = dict(config, allowlist="allowlist.txt")
    results = lint([str(tmp_path)], config=config, root=str(tmp_path), fix=True)
    assert fixed == 1
    assert summarize(results, tmp_path) == MOZBUILD_RESULTS
    assert (tmp_path / "allowlist.txt").read_text() == (
        "# Test allowlist.\n"
        "!sub/Generated.sys.mjs\n"
        "sub/Allowed.sys.mjs\n"
        "sub/final/AllowedPP.sys.mjs\n"
        "sub/globbed/Globbed.sys.mjs\n"
        "sub/nested/AllowedNested.sys.mjs\n"
    )


def test_lint_extra_js_modules_syntax_error(lint, root, config, tmp_path):
    # This moz.build is written at test time because the build system reads
    # moz.build files in the tree and fails on invalid ones.
    shutil.copytree(root, tmp_path, dirs_exist_ok=True)
    broken = tmp_path / "sub" / "syntaxerror" / "moz.build"
    broken.parent.mkdir()
    broken.write_text('EXTRA_JS_MODULES += [\n    "Broken.sys.mjs",\n')
    config = dict(config, allowlist="allowlist.txt")
    results = lint([str(tmp_path)], config=config, root=str(tmp_path))
    assert summarize(results, tmp_path) == sorted([
        STALE_RESULT,
        *MOZBUILD_RESULTS,
        SYNTAX_ERROR_RESULT,
    ])


if __name__ == "__main__":
    mozunit.main()
