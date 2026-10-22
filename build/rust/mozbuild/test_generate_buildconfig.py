# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import unittest
from unittest.mock import patch

import buildconfig
from mozunit import main

sys.path.insert(0, os.path.dirname(__file__))

from generate_buildconfig import generate_objdir_flags


class TestGenerateObjdirFlags(unittest.TestCase):
    def generate(self, flags):
        with patch.object(buildconfig, "topobjdir", "/obj"), patch.object(
            buildconfig, "substs", {"NSPR_CFLAGS": flags}
        ):
            return generate_objdir_flags("NSPR_CFLAGS")

    def assertFlags(self, flags, expected):
        self.assertEqual(
            self.generate(flags),
            "pub static NSPR_CFLAGS: crate::Flags = "
            f"crate::Flags::new(|| vec![{expected}]);\n",
        )

    def test_in_tree(self):
        self.assertFlags(
            ["-I/obj/dist/include/nspr"],
            'crate::objdir_flag("-I", "/dist/include/nspr")',
        )

    def test_objdir_only(self):
        self.assertFlags(["-I/obj"], 'crate::objdir_flag("-I", "")')

    def test_system(self):
        self.assertFlags(["-I/usr/include/nspr"], '"-I/usr/include/nspr"')

    def test_objdir_sibling(self):
        self.assertFlags(["-I/obj-other/include"], '"-I/obj-other/include"')

    def test_mixed(self):
        self.assertFlags(
            ["-I/obj/dist/include/nspr", "-DFOO"],
            'crate::objdir_flag("-I", "/dist/include/nspr"), "-DFOO"',
        )

    def test_unset(self):
        self.assertFlags(None, "")


if __name__ == "__main__":
    main()
