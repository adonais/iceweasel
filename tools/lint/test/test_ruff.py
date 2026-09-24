# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path
from pprint import pprint
from textwrap import dedent

import mozunit
import pytest

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore

LINTER = "ruff"
fixed = 0


def test_lint_fix(lint, create_temp_file):
    contents = dedent(
        """
    import distutils
    print("hello!")
    """
    )

    path = create_temp_file(contents, "bad.py")
    lint([path], fix=True)
    assert fixed == 1


def test_lint_fix_warning(lint, create_temp_file):
    contents = dedent(
        """
        import distutils
        import os

        def foo():
            unused_var = 42
            return
        """
    )

    path = create_temp_file(contents, "bad.py")
    lint([path], warning=True, fix=True)
    assert fixed == 3


def test_lint_fix_without_warning(lint, create_temp_file):
    contents = dedent(
        """
        import distutils
        import os

        def foo():
            unused_var = 42
            return
        """
    )

    path = create_temp_file(contents, "bad.py")
    lint([path], warning=False, fix=True)
    assert fixed == 3


def test_lint_ruff(lint, paths):
    results = lint(paths())
    pprint(results, indent=2)
    assert len(results) == 2
    assert results[0].level == "error"
    assert results[0].relpath == "bad.py"
    assert "`distutils` imported but unused" in results[0].message


@pytest.mark.parametrize("section", ["lint", "format"])
def test_pyproject_section_exclude_uses_directory_globs(section):
    """`exclude` prunes directories while walking the tree, but `lint.exclude` and
    `format.exclude` are matched as globs against each file path, so a bare
    directory there matches nothing at all and is silently ignored."""
    topsrcdir = Path(__file__).parents[3]
    with open(topsrcdir / "pyproject.toml", "rb") as fh:
        excludes = tomllib.load(fh)["tool"]["ruff"][section].get("exclude", [])

    bare_dirs = [
        e for e in excludes if not e.endswith("/**") and (topsrcdir / e).is_dir()
    ]
    assert bare_dirs == [], f"write these as '<dir>/**' in {section}.exclude"


if __name__ == "__main__":
    mozunit.main()
