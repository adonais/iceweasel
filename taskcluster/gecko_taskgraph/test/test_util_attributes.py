# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import unittest

import pytest
from mozunit import main

from gecko_taskgraph.util.attributes import (
    match_run_on_projects,
    match_run_on_repo_type,
)


class MatchRunOnProjects(unittest.TestCase):
    def test_empty(self):
        self.assertFalse(match_run_on_projects("birch", []))

    def test_all(self):
        self.assertTrue(match_run_on_projects("birch", ["all"]))
        self.assertTrue(match_run_on_projects("larch", ["all"]))
        self.assertTrue(match_run_on_projects("autoland", ["all"]))
        self.assertTrue(match_run_on_projects("mozilla-central", ["all"]))
        self.assertTrue(match_run_on_projects("mozilla-beta", ["all"]))
        self.assertTrue(match_run_on_projects("mozilla-release", ["all"]))

    def test_release(self):
        self.assertFalse(match_run_on_projects("birch", ["release"]))
        self.assertTrue(match_run_on_projects("larch", ["release"]))
        self.assertFalse(match_run_on_projects("autoland", ["release"]))
        self.assertTrue(match_run_on_projects("mozilla-central", ["release"]))
        self.assertTrue(match_run_on_projects("mozilla-beta", ["release"]))
        self.assertTrue(match_run_on_projects("mozilla-release", ["release"]))

    def test_integration(self):
        self.assertFalse(match_run_on_projects("birch", ["integration"]))
        self.assertFalse(match_run_on_projects("larch", ["integration"]))
        self.assertTrue(match_run_on_projects("autoland", ["integration"]))
        self.assertFalse(match_run_on_projects("mozilla-central", ["integration"]))
        self.assertFalse(match_run_on_projects("mozilla-beta", ["integration"]))
        self.assertFalse(match_run_on_projects("mozilla-integration", ["integration"]))

    def test_combo(self):
        self.assertTrue(match_run_on_projects("birch", ["release", "birch", "maple"]))
        self.assertTrue(match_run_on_projects("larch", ["release", "birch", "maple"]))
        self.assertTrue(match_run_on_projects("maple", ["release", "birch", "maple"]))
        self.assertFalse(
            match_run_on_projects("autoland", ["release", "birch", "maple"])
        )
        self.assertTrue(
            match_run_on_projects("mozilla-central", ["release", "birch", "maple"])
        )
        self.assertTrue(
            match_run_on_projects("mozilla-beta", ["release", "birch", "maple"])
        )
        self.assertTrue(
            match_run_on_projects("mozilla-release", ["release", "birch", "maple"])
        )
        self.assertTrue(match_run_on_projects("birch", ["birch", "trunk"]))


@pytest.mark.parametrize(
    "repo_type,run_on_repo_types,expected",
    (
        ("hg", ["hg"], True),
        ("hg", [], False),
        ("hg", ["all"], True),
        ("git", ["git", "hg"], True),
        ("git", ["hg"], False),
    ),
)
def test_match_run_on_repo_type(repo_type, run_on_repo_types, expected):
    assert match_run_on_repo_type(repo_type, run_on_repo_types) == expected


if __name__ == "__main__":
    main()
