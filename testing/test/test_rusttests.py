# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import sys
import unittest
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from unittest import mock

from mach.registrar import Registrar
from mozunit import main

Registrar.categories["testing"] = []
Registrar.commands_by_category["testing"] = set()
Registrar.register_category("testing", "testing", "testing")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from mach_commands import run_rusttests
from mozbuild.rust_commands import TEST_SELECTION_ENV


class TestRusttests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(mkdtemp())
        (self.tmpdir / "rust-tests.json").write_text(
            json.dumps({"crates": ["crashreporter", "gkrust"]}), encoding="utf-8"
        )
        self.command_context = mock.Mock(topobjdir=str(self.tmpdir))
        self.dispatch = self.command_context._mach_context.commands.dispatch
        self.dispatch.return_value = 0

    def tearDown(self):
        rmtree(self.tmpdir)

    def _dispatched(self):
        return [call.kwargs for call in self.dispatch.call_args_list]

    def test_rusttests_all(self):
        self.assertEqual(run_rusttests(self.command_context, crates=[]), 0)
        self.assertEqual(
            self._dispatched(),
            [
                {
                    "what": ["rust-prereqs", "rusttests"],
                    "append_env": {TEST_SELECTION_ENV: ""},
                }
            ],
        )

    def test_rusttests_selection(self):
        self.assertEqual(
            run_rusttests(self.command_context, crates=["crashreporter", "gkrust"]), 0
        )
        self.assertEqual(
            self._dispatched(),
            [
                {"what": ["rust-prereqs"]},
                {
                    "what": ["rusttests"],
                    "append_env": {TEST_SELECTION_ENV: "crashreporter gkrust"},
                },
            ],
        )

    def test_rusttests_unknown_crate(self):
        self.assertEqual(
            run_rusttests(self.command_context, crates=["crashreporter", "nope"]),
            1,
        )
        self.assertEqual(self._dispatched(), [{"what": ["rust-prereqs"]}])
        self.assertEqual(
            self.command_context.log.call_args.args[2:],
            ({"crates": "nope"}, "No RUST_TESTS in this build lists {crates}."),
        )


if __name__ == "__main__":
    main()
