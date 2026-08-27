#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

"""Run the DevTools remote debugging backward compatibility tests.

These are regular browser mochitests which need a second Firefox running as the
DevTools server. This is therefore a thin wrapper around desktop_unittest.py
which provisions that server and points the tests at it through
DEVTOOLS_COMPAT_CONFIG.

See devtools/client/aboutdebugging/documentation/TESTS_BACKWARD_COMPAT.md.
"""

import importlib
import os
import sys

here = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(1, os.path.dirname(here))

from desktop_unittest import DesktopUnittest
from mozharness.base.log import INFO

# Installed in the tests archive by backward_compat_test_server/moz.build.
HARNESS_PACKAGE = "devtools_compat"

devtools_compat_config_options = [
    [
        ["--compat-server"],
        {
            "dest": "compat_server",
            "default": "local",
            "help": "Which Firefox to run as the DevTools server. 'local' uses "
            "the build under test, the other values download the latest "
            "build of a distribution channel (beta, devedition, release, "
            "nightly).",
        },
    ],
]


class DevToolsCompatTest(DesktopUnittest):
    config_options = DesktopUnittest.config_options + devtools_compat_config_options

    def query_abs_dirs(self):
        if self.abs_dirs:
            return self.abs_dirs

        abs_dirs = super().query_abs_dirs()
        abs_dirs["abs_devtools_compat_dir"] = os.path.join(
            abs_dirs["abs_test_install_dir"], HARNESS_PACKAGE
        )
        abs_dirs["abs_devtools_compat_cache_dir"] = os.path.join(
            abs_dirs["abs_work_dir"], "devtools-compat-cache"
        )
        self.abs_dirs = abs_dirs
        return self.abs_dirs

    def _import_session(self):
        """Import the provisioning code from the tests archive."""
        dirs = self.query_abs_dirs()
        harness_dir = dirs["abs_devtools_compat_dir"]
        if not os.path.isdir(harness_dir):
            self.fatal(
                f"The DevTools compat harness was not found at {harness_dir}. "
                "It should have been extracted from the common tests archive."
            )

        # The harness is a package, so its parent directory goes on the path.
        sys.path.insert(0, os.path.dirname(harness_dir))
        return importlib.import_module(f"{HARNESS_PACKAGE}.session")

    def run_tests(self):
        dirs = self.query_abs_dirs()
        session = self._import_session()

        server = self.config["compat_server"]
        self.info(f"Provisioning the '{server}' DevTools server")

        with session.provisioned_server(
            binary=self.binary_path,
            cache_dir=dirs["abs_devtools_compat_cache_dir"],
            log_dir=dirs["abs_blob_upload_dir"],
            server=server,
            headless=True,
        ) as compat_server_env:
            self.log(f"Server environment: {compat_server_env}", level=INFO)
            # _run_category_suites builds the test env from os.environ.
            os.environ.update(compat_server_env)
            super().run_tests()


# main {{{1
if __name__ == "__main__":
    devtools_compat_test = DevToolsCompatTest()
    devtools_compat_test.run_and_exit()
