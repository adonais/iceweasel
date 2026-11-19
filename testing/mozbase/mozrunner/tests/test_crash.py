#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

from unittest.mock import patch

import mozunit
import pytest


@pytest.mark.parametrize("logger", [True, False])
def test_crash_count_with_or_without_logger(runner, logger):
    if runner.app == "chrome":
        pytest.xfail("crash checking not implemented for ChromeRunner")

    if not logger:
        runner.logger = None
        fn = "check_for_crashes"
    else:
        fn = "log_crashes"

    with patch(f"mozcrash.{fn}", return_value=2) as mock:
        assert runner.crashed == 0
        assert runner.check_for_crashes() == 2
        assert runner.crashed == 2
        assert runner.check_for_crashes() == 2
        assert runner.crashed == 4

        mock.return_value = 0
        assert runner.check_for_crashes() == 0
        assert runner.crashed == 4


def test_crash_group_passed_to_log_crashes(runner):
    if runner.app == "chrome":
        pytest.xfail("crash checking not implemented for ChromeRunner")

    with patch("mozcrash.log_crashes", return_value=1) as mock:
        assert runner.check_for_crashes(test_name="test_a", group="manifestA") == 1
        assert mock.call_args.kwargs["test"] == "test_a"
        assert mock.call_args.kwargs["group"] == "manifestA"


if __name__ == "__main__":
    mozunit.main()
