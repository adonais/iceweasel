# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Ensure basic function of the sidebar when contextual-password-manager pref is disabled

from pathlib import Path

from marionette_driver import Wait
from marionette_harness import MarionetteTestCase
from mozfile import json


class TestContextualPasswordManagerDisabled(MarionetteTestCase):
    def setUp(self):
        super().setUp()
        self.marionette.set_context("chrome")

    def tearDown(self):
        try:
            # Make sure subsequent tests get a clean profile
            self.marionette.restart(in_app=False, clean=True)
        finally:
            super().tearDown()

    def restart_with_prefs(self, prefs):
        # We need to quit the browser and write the prefs while it is at rest, so that
        # it starts up with these values rather than observing them change at runtime
        pref_path = Path(self.marionette.profile_path) / "prefs.js"
        self.marionette.quit(clean=False, in_app=True)

        remove_prefs = [f'user_pref("{name}"' for name in prefs]
        with open(pref_path, encoding="utf-8") as prefs_file:
            lines = prefs_file.readlines()
        keep_lines = [
            line for line in lines if not any(s in line for s in remove_prefs)
        ]
        with open(pref_path, "w", encoding="utf-8") as prefs_file:
            prefs_file.writelines(keep_lines)
            for name, value in prefs.items():
                if value is not None:
                    prefs_file.write(f'user_pref("{name}", {json.dumps(value)});\n')

        self.marionette.start_session()
        self.marionette.set_context("chrome")
        self.wait_for_sidebar_initialized()

    def wait_for_sidebar_initialized(self):
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

    def get_switcher_menu_ids(self):
        # The ids of the sidebar entries offered by the legacy switcher menu
        return self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            const popup = window.document.getElementById("sidebarMenu-popup");
            return Array.from(
                popup.querySelectorAll("menuitem[id^='sidebar-switcher-']")
            ).filter(item => !item.hidden).map(item => item.id);
            """
        )

    def get_launcher_tool_views(self):
        # The view names of the tool buttons rendered in the revamped launcher
        return self.marionette.execute_async_script(
            """
            let resolve = arguments[0];
            const window = BrowserWindowTracker.getTopWindow();
            const sidebarMain = window.SidebarController.sidebarMain;
            sidebarMain.updateComplete.then(() => resolve(
                Array.from(sidebarMain.toolButtons).map(button => button.getAttribute("view"))
            ));
            """
        )

    def toggle_sidebar(self, command_id):
        # Returns None on success, or the message of whatever the toggle threw.
        # Bug 2056857: toggle() dereferenced a switcher menu item which doesn't
        # exist when the contextual password manager is disabled.
        error = self.marionette.execute_script(
            """
            const [commandID] = arguments;
            const window = BrowserWindowTracker.getTopWindow();
            try {
                window.SidebarController.toggle(commandID);
            } catch (ex) {
                return `${ex}`;
            }
            return null;
            """,
            script_args=(command_id,),
        )
        self.assertIsNone(
            error, f"Toggling {command_id} should not throw, but got: {error}"
        )

    def hide_sidebar(self):
        self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            window.SidebarController.hide();
            """
        )

    def get_current_sidebar_id(self):
        return self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.currentID;
            """
        )

    def is_sidebar_panel_visible(self):
        return self.marionette.execute_script(
            """
            const window = BrowserWindowTracker.getTopWindow();
            return window.SidebarController.isOpen;
            """
        )

    def assert_panels_open_and_close(self):
        self.toggle_sidebar("viewHistorySidebar")
        Wait(self.marionette).until(
            lambda _: self.get_current_sidebar_id() == "viewHistorySidebar",
            message="The history sidebar panel is shown",
        )

        self.toggle_sidebar("viewBookmarksSidebar")
        Wait(self.marionette).until(
            lambda _: self.get_current_sidebar_id() == "viewBookmarksSidebar",
            message="The bookmarks sidebar panel is shown",
        )

        self.hide_sidebar()
        self.assertFalse(
            self.is_sidebar_panel_visible(), "The sidebar panel is closed again"
        )

    def test_revamp_disabled(self):
        # Open browser with sidebar.revamp and contextual-password-manager disabled
        # Test basic function of the sidebar, opening history and bookmarks
        self.restart_with_prefs({
            "sidebar.revamp": False,
            "browser.contextual-password-manager.enabled": False,
        })

        menu_ids = self.get_switcher_menu_ids()
        self.assertIn(
            "sidebar-switcher-history", menu_ids, "History is in the switcher menu"
        )
        self.assertIn(
            "sidebar-switcher-bookmarks", menu_ids, "Bookmarks is in the switcher menu"
        )
        self.assertNotIn(
            "sidebar-switcher-megalist",
            menu_ids,
            "Passwords is not in the switcher menu",
        )

        self.assert_panels_open_and_close()

    def test_revamp_enabled(self):
        # Open browser with sidebar.revamp enabled and contextual-password-manager disabled
        # Test basic function of the sidebar, opening history and bookmarks.
        # The launcher only renders its buttons while it is visible, so ask for a
        # configuration which shows it from startup
        self.restart_with_prefs({
            "sidebar.revamp": True,
            "sidebar.verticalTabs": True,
            "sidebar.visibility": "always-show",
            "browser.contextual-password-manager.enabled": False,
        })

        Wait(self.marionette).until(
            lambda _: self.get_launcher_tool_views(),
            message="The sidebar launcher has rendered its tools",
        )
        tool_views = self.get_launcher_tool_views()
        self.assertIn(
            "viewHistorySidebar", tool_views, "History is in the sidebar launcher"
        )
        self.assertIn(
            "viewBookmarksSidebar", tool_views, "Bookmarks is in the sidebar launcher"
        )
        self.assertNotIn(
            "viewCPMSidebar", tool_views, "Passwords is not in the sidebar launcher"
        )

        self.assert_panels_open_and_close()

    def test_revamp_disabled_at_runtime(self):
        # Start with the revamped sidebar and switch back to the legacy sidebar while
        # running, which rebuilds the switcher menu via toggleRevampSidebar
        self.restart_with_prefs({
            "sidebar.revamp": True,
            "browser.contextual-password-manager.enabled": False,
        })

        self.marionette.set_pref("sidebar.revamp", False)
        Wait(self.marionette).until(
            lambda _: "sidebar-switcher-history" in self.get_switcher_menu_ids(),
            message="The legacy switcher menu is populated",
        )
        self.assertNotIn(
            "sidebar-switcher-megalist",
            self.get_switcher_menu_ids(),
            "Passwords is not in the switcher menu",
        )

        self.assert_panels_open_and_close()
