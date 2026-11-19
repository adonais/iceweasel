# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from unittest.mock import Mock, create_autospec

import mozunit
import pytest
from marionette_driver.marionette import Marionette
from mozrunner.base import GeckoRuntimeRunner


@pytest.mark.parametrize(
    "test_name,test_group,expected",
    [
        (None, None, {"test_name": "marionette.py", "group": None}),
        (
            "test_a.py TestA.test_a",
            None,
            {"test_name": "test_a.py TestA.test_a", "group": None},
        ),
        (
            None,
            "manifest.toml",
            {"test_name": "marionette.py", "group": "manifest.toml"},
        ),
        (
            "test_a.py TestA.test_a",
            "manifest.toml",
            {"test_name": "test_a.py TestA.test_a", "group": "manifest.toml"},
        ),
    ],
)
def test_check_for_crash_passes_test_and_group(test_name, test_group, expected):
    marionette = Marionette()
    # Spec the runner on the real class, so that the test fails if Marionette
    # passes check_for_crashes an argument mozrunner doesn't accept.
    runner = create_autospec(GeckoRuntimeRunner, instance=True)
    runner.check_for_crashes.return_value = 1
    marionette.instance = Mock(runner=runner)
    marionette.test_name = test_name
    marionette.test_group = test_group

    assert marionette.check_for_crash()
    runner.check_for_crashes.assert_called_once_with(**expected)
    assert marionette.crashed == 1


if __name__ == "__main__":
    mozunit.main("-p", "no:terminalreporter", "--log-tbpl=-", "--capture", "no")
