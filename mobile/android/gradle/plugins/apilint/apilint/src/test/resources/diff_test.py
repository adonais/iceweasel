# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# `diff.py` is the oracle for `apidoc_test.py`, which fails the doclet test only
# when diff.py reports a non-zero exit code. A regression that made it always
# report "identical" would silently stop that test from checking anything, so the
# exit codes below are load bearing.

import os
import subprocess as sp
import sys
import tempfile
import unittest
from contextlib import contextmanager

SCRIPT = "src/main/resources/diff.py"

IDENTICAL_CODE = 0
DIFFERENT_CODE = 1

API = """package test {
  public class TestClass {
    method public void testMethod();
  }
}
"""

CHANGED_API = API.replace("testMethod", "renamedMethod")


@contextmanager
def api_files(existing, local):
    paths = []
    try:
        for contents in (existing, local):
            fd, path = tempfile.mkstemp(suffix=".txt", text=True)
            with os.fdopen(fd, "w", encoding="UTF-8") as f:
                f.write(contents)
            paths.append(path)
        yield paths
    finally:
        for path in paths:
            os.unlink(path)


class DiffTest(unittest.TestCase):
    def run_diff(self, existing, local, command=None):
        with api_files(existing, local) as (existing_path, local_path):
            test = [
                sys.executable,
                SCRIPT,
                "--existing",
                existing_path,
                "--local",
                local_path,
            ]
            if command is not None:
                test.extend(["--command", command])

            result = sp.run(test, stdout=sp.PIPE, encoding="UTF-8", check=False)
            return result.returncode, result.stdout

    def test_identicalFilesReportNoDifference(self):
        code, output = self.run_diff(API, API)
        self.assertEqual(code, IDENTICAL_CODE)
        self.assertEqual(output, "")

    def test_changedApiReportsDifference(self):
        code, output = self.run_diff(API, CHANGED_API)
        self.assertEqual(code, DIFFERENT_CODE)
        self.assertIn("-    method public void testMethod();", output)
        self.assertIn("+    method public void renamedMethod();", output)

    def test_emptyLocalApiReportsDifference(self):
        code, _ = self.run_diff(API, "")
        self.assertEqual(code, DIFFERENT_CODE)

    def test_commandIsPrintedWhenApiDiffers(self):
        code, output = self.run_diff(
            API, CHANGED_API, command="./mach gradle apiUpdate"
        )
        self.assertEqual(code, DIFFERENT_CODE)
        self.assertIn("./mach gradle apiUpdate", output)

    def test_commandIsNotPrintedWhenApiMatches(self):
        code, output = self.run_diff(API, API, command="./mach gradle apiUpdate")
        self.assertEqual(code, IDENTICAL_CODE)
        self.assertNotIn("./mach gradle apiUpdate", output)


if __name__ == "__main__":
    unittest.main()
