#!/usr/bin/env python

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import mozunit
import pytest
from manifestparser.toml import Carry


@pytest.fixture(scope="session")
def carry():
    c = Carry()
    yield c


@pytest.mark.parametrize(
    "test_index, e_condition, condition, expected",  # test_index for convenience
    [
        (
            1,
            "os == 'android' && processor == 'x86_64'",
            "os == 'android' && os_version == '14' && processor == 'x86_64'",
            True,
        ),
        (
            2,
            "http3",
            "os == 'linux' && os_version == '24.04' && processor == 'x86_64' && display == 'x11' && xorigin",
            False,
        ),
        (
            3,
            "http3",
            "os == 'linux' && os_version == '24.04' && processor == 'x86_64' && display == 'x11' && xorigin && debug",
            False,
        ),
        (
            4,
            "os == 'android' && debug",
            "os == 'android' && os_version == '14' && debug",
            True,
        ),
        (
            5,
            "os == 'android' && !debug",
            "os == 'android' && os_version == '14' && debug",
            False,
        ),
        (
            6,
            "os == 'android' && debug",
            "os == 'android' && os_version == '14' && !debug",
            False,
        ),
        (
            7,
            "os == 'android'",
            "os == 'android' && os_version == '14' && debug",
            True,
        ),
        (
            8,
            "os == 'android'",
            "os == 'android' && os_version == '14' && !debug",
            True,
        ),
        (
            9,
            "os == 'android' && debug",
            "os == 'android' && os_version == '14'",
            False,
        ),
        (
            10,
            "os == 'android' && !debug",
            "os == 'android' && os_version == '14'",
            False,
        ),
        (
            11,
            "os == 'android' && asan",
            "os == 'android' && os_version == '14' && ccov",
            True,
        ),
        (
            12,
            "os == 'android'",
            "os == 'android' && os_version == '14' && ccov",
            True,
        ),
        (
            13,
            "os == 'android' && tsan",
            "os == 'android' && os_version == '14'",
            False,
        ),
        (
            14,
            "os == 'linux' && debug && socketprocess_networking",
            "os == 'android' && debug",
            False,
        ),
        (15, "debug && socketprocess_networking", "os == 'android' && debug", True),
        (16, "os == 'linux'", "verify", False),
        (17, "os == 'win'", "tsan", False),
        (
            18,
            "os == 'linux' && os_version == '18.04' && debug",
            "os == 'linux' && os_version == '24.04' && asan && isolated_debug_process",
            False,
        ),
        (
            19,
            "os == 'linux' && os_version == '18.04' && isolated_debug_process",
            "os == 'linux' && os_version == '24.04' && opt",
            True,
        ),
        (
            20,
            "os == 'android' && opt",
            "os == 'android' && os_version == '14' && !debug",
            True,
        ),
        (
            21,
            "os == 'android' && !debug",
            "os == 'android' && os_version == '14' && opt",
            True,
        ),
        (
            22,
            "!opt",
            "!opt",
            True,
        ),
        (
            23,
            "!opt",
            "asan",
            True,
        ),
        (
            24,
            "ccov",
            "!opt",
            True,
        ),
        (
            25,
            "debug",
            "tsan",
            False,
        ),
        (
            26,
            "ccov",
            "debug",
            False,
        ),
    ],
)
def test_platform_match_for_carryover(
    carry: Carry, test_index: int, e_condition: str, condition: str, expected: bool
):
    """
    Verify TOML function _condition_is_carryover platform match heuristic
    """
    assert test_index == carry.test_index()  # help maintain order
    assert carry.is_carryover(e_condition, condition) == expected


if __name__ == "__main__":
    mozunit.main()
