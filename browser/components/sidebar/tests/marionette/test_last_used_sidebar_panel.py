# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


from marionette_driver import Wait
from marionette_harness import MarionetteTestCase


class TestLastUsedSidebarPanel(MarionetteTestCase):
    def setUp(self):
        super().setUp()
        self.marionette.set_context("chrome")
        # Add the sidebar button widget at the start of the horizontal tabstrip
        self.marionette.execute_script(
            "CustomizableUI.addWidgetToArea('sidebar-button', CustomizableUI.AREA_NAVBAR, 0)"
        )

    def tearDown(self):
        try:
            # Make sure subsequent tests get a clean profile
            self.marionette.restart(in_app=False, clean=True)
        finally:
            super().tearDown()

    def click_toolbar_button(self):
        # Click the button to show the launcher
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.document.getElementById("sidebar-button").click()
            """
        )

    def wait_until_stable(self):
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.waitUntilStable();
            """
        )

    def is_sidebar_panel_visible(self):
        hidden = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.document.getElementById("sidebar-box").hidden;
            """
        )
        return not hidden

    def is_launcher_visible(self):
        hidden = self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.document.getElementById("sidebar-container").hidden;
            """
        )
        return not hidden

    def get_current_sidebar_id(self):
        return self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.document.getElementById("sidebar-box").getAttribute("sidebarcommand");
            """
        )

    def test_panel_reopened(self):
        # Horizontal tabs, so the visibility mode is "hide-on-close": the
        # launcher starts hidden and is the user's to reveal with the toolbar
        # button, independently of which panel is open.
        self.assertFalse(
            self.is_sidebar_panel_visible(), "The sidebar panel is not initially shown"
        )
        self.assertFalse(
            self.is_launcher_visible(), "The sidebar launcher is not initially shown"
        )
        self.assertFalse(
            self.get_current_sidebar_id(), "The sidebar panel has no current ID"
        )

        # Open the history sidebar
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.toggle("viewHistorySidebar");
            """
        )

        Wait(self.marionette).until(
            lambda _: self.get_current_sidebar_id() == "viewHistorySidebar",
            message="The history sidebar is visible",
        )

        # The launcher is hidden while the panel is open, so the first click
        # reveals the launcher and leaves the panel alone.
        self.click_toolbar_button()
        self.wait_until_stable()

        self.assertTrue(self.is_launcher_visible(), "The sidebar launcher is now shown")
        self.assertTrue(
            self.is_sidebar_panel_visible(), "The sidebar panel is still open"
        )

        # Clicking again hides the launcher, which closes the panel with it but
        # keeps it as the last used panel.
        self.click_toolbar_button()
        self.wait_until_stable()

        self.assertFalse(
            self.is_launcher_visible(), "The sidebar launcher is hidden again"
        )
        self.assertFalse(
            self.is_sidebar_panel_visible(), "The sidebar panel is now closed"
        )

        self.marionette.restart(clean=False, in_app=True)
        self.marionette.set_context("chrome")

        self.assertFalse(
            self.is_sidebar_panel_visible(), "The sidebar panel is initially closed"
        )
        self.assertFalse(
            self.is_launcher_visible(), "The sidebar launcher is initially hidden"
        )
        # Revealing the launcher with nothing open brings back the last used
        # panel, which is what this test is here for.
        self.click_toolbar_button()

        Wait(self.marionette).until(
            lambda _: self.get_current_sidebar_id() == "viewHistorySidebar",
            message="The history sidebar is visible",
        )
