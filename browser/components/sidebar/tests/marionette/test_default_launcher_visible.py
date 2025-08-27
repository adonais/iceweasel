# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from marionette_driver import Wait
from marionette_driver.by import By
from marionette_harness import MarionetteTestCase

initial_prefs = {
    "sidebar.revamp": False,
    # Set browser restore previous session pref
    # we'll need to examine behavior using restored sidebar properties
    "browser.startup.page": 3,
}


class TestDefaultLauncherVisible(MarionetteTestCase):

    def setUp(self):
        MarionetteTestCase.setUp(self)

        self.marionette.set_context("chrome")

    def tearDown(self):
        try:
            # Make sure subsequent tests get a clean profile
            self.marionette.restart(in_app=False, clean=True)
        finally:
            super().tearDown()

    def _close_last_tab(self):
        # "self.marionette.close" cannot be used because it doesn't
        # allow closing the very last tab.
        self.marionette.execute_script("window.close()")

    def restart_with_prefs(self, prefs):
        # set the prefs then restart the browser
        self.marionette.enforce_gecko_prefs(prefs)

        # Restore the context as used before the restart
        self.marionette.set_context("chrome")

        self.wait_for_sidebar_initialized()

    def is_launcher_visible(self):
        hidden = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.sidebarContainer.hidden;
            """
        )
        return not hidden

    def is_button_visible(self):
        visible = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            const placement = window.CustomizableUI.getPlacementOfWidget('sidebar-button');
            if (!placement) {
                return false;
            }
            const node = window.document.getElementById("sidebar-button");
            return node && !node.hidden;
            """
        )
        return visible

    def click_toolbar_button(self):
        # Click the button to show the launcher
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.document.getElementById("sidebar-button").click()
            """
        )

    def wait_for_sidebar_initialized(self):
        self.marionette.set_context("chrome")
        self.marionette.execute_async_script(
            """
            let resolve = arguments[0];
            let { BrowserInitState } = ChromeUtils.importESModule("resource:///modules/BrowserGlue.sys.mjs");

            (async () => {
                await BrowserInitState.startupIdleTaskPromise;
                const win = BrowserWindowTracker.getTopWindow();
                await win.SidebarController.promiseInitialized;
            })().then(resolve);
            """
        )

    def test_first_use_default_visible_pref_false(self):
        # We test with the default pref values, then flip sidebar.revamp to true,
        # for a profile that has never enabled or seen the sidebar launcher.
        # We want to ensure the sidebar state is correctly persisted and restored

        self.wait_for_sidebar_initialized()

        self.assertFalse(
            self.is_launcher_visible(),
            "Sidebar launcher is hidden",
        )
        self.assertFalse(
            self.is_button_visible(),
            "Sidebar toolbar button is hidden",
        )

        # Mimic an update which enables sidebar.revamp for the first time
        self.restart_with_prefs(
            {
                "sidebar.revamp": True,
                "browser.startup.page": 3,
            }
        )

        self.assertTrue(
            self.is_button_visible(),
            "Sidebar button should be visible",
        )

        self.assertFalse(
            self.is_launcher_visible(),
            "Sidebar launcher is expected to be initially hidden when starting with sidebar.revamp",
        )

        # Click the button and verify that sticks
        self.click_toolbar_button()

        Wait(self.marionette).until(
            lambda _: self.is_launcher_visible(),
            message="Sidebar launcher should now be visible",
        )
        self.marionette.restart()
        self.marionette.set_context("chrome")
        self.wait_for_sidebar_initialized()

        self.assertTrue(
            self.is_launcher_visible(),
            "Sidebar launcher remains visible because user showed it in the resumed session",
        )

    def test_new_sidebar_enabled_via_settings(self):
        self.wait_for_sidebar_initialized()
        self.assertFalse(
            self.is_launcher_visible(),
            "Sidebar launcher is not visible",
        )
        self.assertFalse(
            self.is_button_visible(),
            "Sidebar toolbar button is not visible",
        )

        # Navigate to about:preferences and enable the new sidebar
        self.marionette.set_context("content")
        self.marionette.navigate("about:preferences")

        self.marionette.find_element(By.ID, "browserLayoutShowSidebar").click()

        self.marionette.set_context("chrome")
        # We expect that to add the button to the toolbar
        Wait(self.marionette).until(
            lambda _: self.is_button_visible(),
            message="The toolbar button is visible",
        )

        # In this scenario, even when the defaultLauncherVisible is False, the launcher
        # should have been shown
        self.assertTrue(
            self.is_launcher_visible(),
            "The launcher is shown when revamp is enabled by the user",
        )

        # And it should stay visible on restart
        self.marionette.restart()
        self.marionette.set_context("chrome")
        self.wait_for_sidebar_initialized()

        self.assertTrue(
            self.is_launcher_visible(),
            "Sidebar launcher should still be shown after restart",
        )

    def test_new_sidebar_enabled_at_runtime_via_nimbus(self):
        self.wait_for_sidebar_initialized()
        self.assertFalse(
            self.is_launcher_visible(),
            "Sidebar launcher is not visible",
        )
        self.assertFalse(
            self.is_button_visible(),
            "Sidebar toolbar button is not visible",
        )

        # stub the getVariable function to return false so sidebar code thinks
        # we're enrolled in an experiment
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            window.NimbusFeatures.sidebar.getVariable = () => false;
            """
        )

        showLauncherOnEnabled = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.SidebarManager.showLauncherOnEnabled;
            """
        )
        self.assertFalse(
            showLauncherOnEnabled,
            "showLauncherOnEnabled should be false when with the mocked NimbusFeatures getVariable",
        )

        # This mocks the enrollment in which Nimbus sets the following prefs
        self.marionette.set_prefs(
            {
                "sidebar.revamp": True,
                "sidebar.revamp.defaultLauncherVisible": False,
            }
        )

        # We expect enabling the pref to add the button to the toolbar
        Wait(self.marionette).until(
            lambda _: self.is_button_visible(),
            message="The toolbar button is visible",
        )

        # In this scenario, we expect the launcher visibility to be determined by the nimbus variable
        self.assertFalse(
            self.is_launcher_visible(),
            "The launcher is hidden when revamp is not initiated by the user",
        )

        # And it should stay hidden on restart
        self.marionette.restart()
        self.marionette.set_context("chrome")
        self.wait_for_sidebar_initialized()

        self.assertFalse(
            self.is_launcher_visible(),
            "The launcher is remains hidden after a restart",
        )

    def test_vertical_tabs_default_hidden(self):
        # Verify that starting with verticalTabs enabled and default visibility false results in a visible
        # launcher with the vertical tabstrip
        self.restart_with_prefs(
            {
                "sidebar.revamp": True,
                "sidebar.verticalTabs": True,
                "sidebar.visibility": "always-show",
            }
        )

        Wait(self.marionette).until(
            lambda _: self.is_launcher_visible(),
            message="Sidebar launcher should be initially visible",
        )
        tabsWidth = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return document.getElementById("vertical-tabs").getBoundingClientRect().width;
            """
        )
        self.assertGreater(tabsWidth, 0, "#vertical-tabs element has width")

        # switch to 'hide-sidebar' visibility mode and confirm the launcher becomes hidden
        self.marionette.set_pref("sidebar.visibility", "hide-sidebar")
        Wait(self.marionette).until(
            lambda _: not self.is_launcher_visible(),
            message="Sidebar launcher should become hidden when hide-sidebar visibility is set and defaultLauncherVisible2 is false",
        )
