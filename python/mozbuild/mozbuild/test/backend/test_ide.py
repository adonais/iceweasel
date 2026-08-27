# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from unittest import mock

from mozunit import main

from mozbuild.backend.clangd import find_vscode_or_vscodium_cmd


class TestFindVscodeOrVscodiumCmd(unittest.TestCase):
    def test_each_ide_opens_its_own_editor(self):
        fake_path = {"code": "/bin/code", "codium": "/bin/codium"}

        with mock.patch("shutil.which", side_effect=fake_path.get):
            self.assertEqual(find_vscode_or_vscodium_cmd("vscode"), ["/bin/code"])
            self.assertEqual(find_vscode_or_vscodium_cmd("vscodium"), ["/bin/codium"])


if __name__ == "__main__":
    main()
