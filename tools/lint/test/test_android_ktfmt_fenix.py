# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import mozpack.path as mozpath
import mozunit
from conftest import build
from mozlint.result import ResultSummary

LINTER = "android-fenix"

FILES = mozpath.join(build.topsrcdir, "tools", "lint", "test", "files", "android-ktfmt")
SUBDIR = mozpath.join("mobile", "android", "fenix")
APP = mozpath.join(SUBDIR, "app", "src", "main", "java", "org", "mozilla", "fenix")
FILE1 = mozpath.join(APP, "File1.kt")
FILE2 = mozpath.join(APP, "File2.kt")


def parse_results(config, topobjdir="fenix"):
    from android.lints import parse_ktfmt_results

    ResultSummary.root = build.topsrcdir

    return parse_ktfmt_results(
        config,
        SUBDIR,
        topsrcdir=build.topsrcdir,
        topobjdir=mozpath.join(FILES, topobjdir),
    )


def test_reports_each_unformatted_file(config):
    results = parse_results(config)
    assert len(results) == 2
    assert sorted(r.relpath for r in results) == [FILE1, FILE2]
    assert all(r.linter == LINTER for r in results)
    assert all(r.rule == "ktfmt" for r in results)
    assert all(r.level == "error" for r in results)
    assert all("--fix" in r.message for r in results)


def test_no_errors_when_spotless_wrote_nothing(config):
    """Spotless leaves its output folder empty when every file is formatted."""
    results = parse_results(config, topobjdir="clean")
    assert len(results) == 0


if __name__ == "__main__":
    mozunit.main()
