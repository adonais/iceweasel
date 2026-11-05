# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

import mozpack.path as mozpath
from mozunit import main

from mozbuild.frontend.gyp_reader import GypProcessor
from mozbuild.frontend.reader import BuildReader
from mozbuild.test.common import MockConfig

data_path = mozpath.join(mozpath.abspath(mozpath.dirname(__file__)), "data")


@unittest.skipIf(sys.platform.startswith("win"), "Uses a POSIX shell in gyp")
class TestGypProcessor(unittest.TestCase):
    @mock.patch.dict(os.environ)
    def test_env_does_not_leak(self):
        os.environ.pop("CC", None)
        os.environ.pop("CFLAGS", None)
        config = MockConfig(
            mozpath.join(data_path, "gyp-env"),
            extra_substs={
                "CC_TYPE": "clang",
                "CC": ["/path/to/clang", "--target=x86_64-linux-android26"],
                "CC_BASE_FLAGS": ["-fno-foo"],
            },
        )
        gyp_dir_attrs = SimpleNamespace(no_chromium=True, variables={})
        path = mozpath.join(config.topsrcdir, "test.gyp")
        with BuildReader(config)._gyp_worker_pool as executor:
            processor = GypProcessor(
                config, gyp_dir_attrs, path, "out", executor, {}, []
            )
            # The variables must not be set in the calling process, as they
            # would be inherited by unrelated subprocesses (bug 2072855).
            self.assertNotIn("CC", os.environ)
            self.assertNotIn("CFLAGS", os.environ)

            _, targets, _ = processor._gyp_loader_future.result()

        self.assertNotIn("CC", os.environ)
        self.assertNotIn("CFLAGS", os.environ)

        # But gyp itself should see them.
        (target,) = targets.values()
        self.assertEqual(
            target["configurations"]["Default"]["defines"],
            [
                "TEST_CC=/path/to/clang --target=x86_64-linux-android26",
                "TEST_CFLAGS=-fno-foo",
            ],
        )


if __name__ == "__main__":
    main()
