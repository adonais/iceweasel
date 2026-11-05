# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from unittest.mock import MagicMock, call

from mozunit import main

from mozboot.bootstrap import CONFIGURE_SCCACHE, Bootstrapper
from mozboot.mozconfig import MozconfigBuilder


class TestSccacheMozconfig(unittest.TestCase):
    def _make_bootstrapper(
        self, artifact_mode=False, no_interactive=False, sccache_configure=False
    ):
        bootstrapper = Bootstrapper.__new__(Bootstrapper)
        bootstrapper.sccache_configure = sccache_configure
        bootstrapper.exclude = []
        bootstrapper.instance = MagicMock()
        bootstrapper.instance.artifact_mode = artifact_mode
        bootstrapper.instance.no_interactive = no_interactive
        return bootstrapper

    def test_non_artifact_interactive_accept(self):
        bootstrapper = self._make_bootstrapper()
        bootstrapper.instance.prompt_yesno.return_value = True
        builder = MozconfigBuilder()

        bootstrapper._maybe_configure_sccache(builder)

        self.assertIn("ac_add_options --with-ccache=sccache", builder.generate())
        bootstrapper.instance.prompt_yesno.assert_called_once_with(
            prompt=CONFIGURE_SCCACHE
        )

    def test_non_artifact_interactive_decline(self):
        bootstrapper = self._make_bootstrapper()
        bootstrapper.instance.prompt_yesno.return_value = False
        builder = MozconfigBuilder()

        bootstrapper._maybe_configure_sccache(builder)

        self.assertNotIn("ac_add_options --with-ccache=sccache", builder.generate())

    def test_non_artifact_non_interactive_flag_true(self):
        bootstrapper = self._make_bootstrapper(
            no_interactive=True, sccache_configure=True
        )
        builder = MozconfigBuilder()

        bootstrapper._maybe_configure_sccache(builder)

        self.assertIn("ac_add_options --with-ccache=sccache", builder.generate())
        bootstrapper.instance.prompt_yesno.assert_not_called()

    def test_non_artifact_non_interactive_flag_false(self):
        bootstrapper = self._make_bootstrapper(no_interactive=True)
        builder = MozconfigBuilder()

        bootstrapper._maybe_configure_sccache(builder)

        self.assertNotIn("ac_add_options --with-ccache=sccache", builder.generate())
        bootstrapper.instance.prompt_yesno.assert_not_called()

    def test_artifact_mode_skips_sccache(self):
        bootstrapper = self._make_bootstrapper(artifact_mode=True)
        builder = MozconfigBuilder()

        bootstrapper._maybe_configure_sccache(builder)

        self.assertNotIn("ac_add_options --with-ccache=sccache", builder.generate())
        bootstrapper.instance.prompt_yesno.assert_not_called()

    def test_private_package_bootstrap_configures_sccache(self):
        bootstrapper = self._make_bootstrapper()
        bootstrapper.instance.prompt_yesno.return_value = True
        builder = MozconfigBuilder()

        bootstrapper.maybe_install_private_packages_or_exit("browser", "git", builder)

        self.assertIn("ac_add_options --with-ccache=sccache", builder.generate())
        bootstrapper.instance.auto_bootstrap.assert_called_once_with("browser", [])
        bootstrapper.instance.ensure_sccache_packages.assert_called_once_with()
        self.assertLess(
            bootstrapper.instance.method_calls.index(
                call.auto_bootstrap("browser", [])
            ),
            bootstrapper.instance.method_calls.index(
                call.prompt_yesno(prompt=CONFIGURE_SCCACHE)
            ),
        )
        self.assertLess(
            bootstrapper.instance.method_calls.index(
                call.prompt_yesno(prompt=CONFIGURE_SCCACHE)
            ),
            bootstrapper.instance.method_calls.index(call.ensure_sccache_packages()),
        )


class TestAgenticTools(unittest.TestCase):
    def _make_bootstrapper(
        self, no_interactive=False, no_agentic_tools=False, tools_installed=False
    ):
        bootstrapper = Bootstrapper.__new__(Bootstrapper)
        bootstrapper.no_agentic_tools = no_agentic_tools
        bootstrapper.instance = MagicMock()
        bootstrapper.instance.no_interactive = no_interactive
        bootstrapper.instance.cargo_tools_installed.return_value = tools_installed
        return bootstrapper

    def test_interactive_accept(self):
        bootstrapper = self._make_bootstrapper()
        bootstrapper.instance.prompt_yesno.return_value = True

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_called_once()
        bootstrapper.instance.ensure_cargo_tools.assert_called_once_with()

    def test_interactive_decline(self):
        bootstrapper = self._make_bootstrapper()
        bootstrapper.instance.prompt_yesno.return_value = False

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_called_once()
        bootstrapper.instance.ensure_cargo_tools.assert_not_called()

    def test_interactive_already_installed(self):
        bootstrapper = self._make_bootstrapper(tools_installed=True)

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_not_called()
        bootstrapper.instance.ensure_cargo_tools.assert_called_once_with()

    def test_non_interactive(self):
        bootstrapper = self._make_bootstrapper(no_interactive=True)

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_not_called()
        bootstrapper.instance.ensure_cargo_tools.assert_called_once_with()

    def test_disabled_interactive(self):
        bootstrapper = self._make_bootstrapper(no_agentic_tools=True)

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_not_called()
        bootstrapper.instance.ensure_cargo_tools.assert_not_called()

    def test_disabled_non_interactive(self):
        bootstrapper = self._make_bootstrapper(
            no_interactive=True, no_agentic_tools=True
        )

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.prompt_yesno.assert_not_called()
        bootstrapper.instance.ensure_cargo_tools.assert_not_called()

    def test_disabled_already_installed(self):
        bootstrapper = self._make_bootstrapper(
            no_agentic_tools=True, tools_installed=True
        )

        bootstrapper.check_agentic_tools()

        bootstrapper.instance.ensure_cargo_tools.assert_not_called()


if __name__ == "__main__":
    main()
