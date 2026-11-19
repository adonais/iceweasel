/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.uiautomator.UiSelector
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_URL_BOX
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.NAVIGATION_BAR
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.packageName
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationArrival
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.selectors.ToolbarSelectors

class ToolbarComponent(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {
    override val pageName = "ToolbarComponent"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "HomePage",
            to = pageName,
            steps = listOf(),
            arrival = NavigationArrival.EDGE_COMPLETION,
        )

        builder.register(
            from = "BrowserPage",
            to = pageName,
            steps = listOf(),
            arrival = NavigationArrival.EDGE_COMPLETION,
        )
    }

    override val selectorCatalog = ToolbarSelectors

    /**
     * Assert the address-bar toolbar sits in the top half of the screen. With shouldUseExpandedToolbar the toolbar is
     * at the bottom in portrait, but moves to the top in landscape and when the tab strip is enabled. Ports the legacy
     * HomeScreenRobot.verifyToolbarPosition(bottomPosition = false) geometry.
     */
    fun verifyToolbarIsAtTop(): ToolbarComponent {
        val toolbar = mDevice.findObject(UiSelector().resourceId("$packageName:id/composable_toolbar"))
        if (!toolbar.waitForExists(TestAssetHelper.waitingTime)) {
            throw AssertionError("Toolbar must be present in the view hierarchy")
        }
        if (toolbar.visibleBounds.centerY() >= mDevice.displayHeight / 2) {
            throw AssertionError("Toolbar should be positioned at the top of the screen")
        }
        return this
    }

    /**
     * Assert the address-bar toolbar sits in the bottom half of the screen. Inverse of [verifyToolbarIsAtTop]; ports
     * the legacy HomeScreenRobot.verifyToolbarPosition(bottomPosition = true) geometry.
     */
    fun verifyToolbarIsAtBottom(): ToolbarComponent {
        val toolbar = mDevice.findObject(UiSelector().resourceId("$packageName:id/composable_toolbar"))
        if (!toolbar.waitForExists(TestAssetHelper.waitingTime)) {
            throw AssertionError("Toolbar must be present in the view hierarchy")
        }
        if (toolbar.visibleBounds.centerY() <= mDevice.displayHeight / 2) {
            throw AssertionError("Toolbar should be positioned at the bottom of the screen")
        }
        return this
    }

    /**
     * Assert the navigation bar sits below the address-bar toolbar. The navigation bar is always the bottom-most bar;
     * the toolbar-position preference only moves the address bar (to the top, or to just above the navigation bar), so
     * this holds for both the top and bottom expanded-toolbar layouts.
     *
     * Both bars are measured in the same Compose window coordinate space - the navigation bar via its tag and the
     * address bar via its URL box - and compared by center. Mixing Compose bounds with the toolbar's UIAutomator screen
     * bounds (as a previous version did) was only off by the window offset, which is harmless when the bars are far
     * apart but flips the result once they abut in the bottom layout.
     */
    fun verifyNavBarIsAtBottom(): ToolbarComponent {
        val navBarCenterY = composeRule.onNodeWithTag(NAVIGATION_BAR).fetchSemanticsNode().boundsInWindow.center.y
        val addressBarCenterY =
            composeRule.onAllNodesWithTag(ADDRESSBAR_URL_BOX).onFirst().fetchSemanticsNode().boundsInWindow.center.y
        if (navBarCenterY <= addressBarCenterY) {
            throw AssertionError("Navigation bar should be positioned below the toolbar")
        }
        return this
    }
}
