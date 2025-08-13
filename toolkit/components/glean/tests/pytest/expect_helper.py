# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import inspect
import json
import os


def expect(path, actual, is_json=False):
    """
    Assert that the content of the file at `path` contains `actual`.

    If the environment variable `UPDATE_EXPECT` is set, the path content is updated to `actual`.
    This allows to update the file contents easily.

    Args:
        path: Path to the expected file
        actual: The actual content to compare
        is_json: If True, performs JSON comparison instead of string comparison
    """

    callerframerecord = inspect.stack()[1]
    frame = callerframerecord[0]
    info = inspect.getframeinfo(frame)
    msg = f"""
Unexpected content in {path} (at {info.filename}:{info.lineno})

If the code generation was changed,
run the test suite again with `UPDATE_EXPECT=1` set to update the test files.
""".strip()

    if "UPDATE_EXPECT" in os.environ:
        with open(path, "w") as file:
            file.write(actual)

    expected = None
    with open(path) as file:
        expected = file.read()

    if is_json:
        try:
            actual_json = json.loads(actual)
            expected_json = json.loads(expected)
            assert actual_json == expected_json, msg
        except json.JSONDecodeError as e:
            print(f"Warning: JSON parsing failed: {e}")
            print("Falling back to string comparison")
            assert actual == expected, msg
    else:
        assert actual == expected, msg
