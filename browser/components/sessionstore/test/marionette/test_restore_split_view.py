# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 0.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/0.0/.

import os
import sys

# add this directory to the path
sys.path.append(os.path.dirname(__file__))

from session_store_test_case import SessionStoreTestCase


def inline(title):
    return f"data:text/html;charset=utf-8,<html><head><title>{title}</title></head><body></body></html>"


class TestSessionRestoreSplitView(SessionStoreTestCase):
    """
    Test the interactions between Session Restore and Split View.
    """

    def setUp(self):
        super().setUp(
            startup_page=1,
            include_private=False,
            restore_on_demand=True,
            test_windows=set(
                [
                    (
                        inline("Tab 1"),
                        inline("Tab 2"),
                        inline("Tab 3"),
                    ),
                ]
            ),
        )

    def test_add_inactive_tabs_to_split_view(self):
        """
        When we restart with some tabs, we defer loading and setting up those
        tabs until they become active.

        Ensure that adding these tabs to a split view triggers that.
        """
        self.assertEqual(
            len(self.marionette.chrome_window_handles),
            1,
            msg="Should have 1 window open.",
        )

        # There are currently three tabs open.
        # Switch to the first one, and then restart.
        self.marionette.execute_script("gBrowser.selectTabAtIndex(0)")
        self.marionette.restart()
        self.marionette.set_context("chrome")

        # After restart:
        # Tab 1 is active.
        # Tab 2 & Tab 3 are inactive, and haven't been activated yet.
        self.assertEqual(
            self.marionette.execute_script("return gBrowser.tabs.length"),
            3,
            msg="Should have 3 tabs open.",
        )
        self.assertEqual(
            self.marionette.execute_script(
                "return gBrowser.tabContainer.selectedIndex"
            ),
            0,
            msg="First tab should be selected.",
        )

        # Create a split view with the inactive tabs (Tab 2 & Tab 3).
        # Select Tab 2 to activate the split view.
        # Wait for both tabs in the split view to finish restoring.
        self.marionette.execute_async_script(
            """
            let [resolve] = arguments;
            gBrowser.addTabSplitView([gBrowser.tabs[1], gBrowser.tabs[2]]);
            let promiseTabsRestored = new Promise(resolve => {
                let tabsRemaining = 2;
                function handleTabRestored() {
                    if (!--tabsRemaining) {
                        gBrowser.tabContainer.removeEventListener(
                            "SSTabRestored",
                            handleTabRestored
                        );
                        resolve();
                    }
                }
                gBrowser.tabContainer.addEventListener("SSTabRestored", handleTabRestored);
            });
            gBrowser.selectTabAtIndex(1);
            promiseTabsRestored.then(resolve);
            """
        )
