# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import io
import sys
from os import path
from pathlib import Path

import mozunit

ROOT_PATH = path.abspath(
    path.join(
        path.dirname(__file__),
        path.pardir,
        path.pardir,
        path.pardir,
        path.pardir,
        path.pardir,
    )
)

WEBEXT_METRICS_PATH = path.join(
    ROOT_PATH, "browser", "extensions", "newtab", "webext-glue", "metrics"
)
sys.path.append(WEBEXT_METRICS_PATH)
import glean_utils

# Shenanigans to access expect helper and metrics and pings test yaml under glean python tests
GLEAN_TESTS_PATH = path.join(
    ROOT_PATH, "toolkit", "components", "glean", "tests", "pytest"
)
sys.path.append(GLEAN_TESTS_PATH)
from expect_helper import expect

# Shenanigans to import run_glean_parser
GLEAN_BUILD_SCRIPTS_PATH = path.join(
    ROOT_PATH, "toolkit", "components", "glean", "build_scripts", "glean_parser_ext"
)
sys.path.append(GLEAN_BUILD_SCRIPTS_PATH)

import run_glean_parser


def test_jogfile_output_key():
    """
    A regression test. Very fragile.
    It generates a jogfile with keys for metrics_test.yaml and compares that JSON with an expected output JSON file.

    To generate new expected output files, set `UPDATE_EXPECT=1` when running the test suite:

    UPDATE_EXPECT=1 mach test toolkit/components/glean/tests/pytest
    """

    options = {"allow_reserved": False}

    input_files = [
        Path(GLEAN_TESTS_PATH) / "metrics_test.yaml",
        Path(GLEAN_TESTS_PATH) / "pings_test.yaml",
    ]

    all_objs, options = run_glean_parser.parse_with_options(input_files, options)

    output_fd = io.StringIO()
    glean_utils.output_file_with_key(all_objs, output_fd, options)

    # Compare the generated output with expected output using JSON comparison by passing is_JSON as True
    expect(
        Path(path.dirname(__file__)) / "jogfile_output_key", output_fd.getvalue(), True
    )


if __name__ == "__main__":
    mozunit.main()
