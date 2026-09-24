/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.test.uiautomator.UiSelector
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSearchManageShortcutsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSearchSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsSearchManageShortcutsPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "SettingsSearchManageShortcutsPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "SettingsSearchPage",
            to = pageName,
            steps = listOf(NavigationStep.Click(SettingsSearchSelectors.MANAGE_SHORTCUTS_SETTING_OPTION)),
        )

        builder.register(
            from = pageName,
            to = "SettingsSearchPage",
            steps = listOf(NavigationStep.Click(SettingsSelectors.GO_BACK_BUTTON)),
        )
    }

    override val selectorCatalog = SettingsSearchManageShortcutsSelectors

    // Covariant override so the page's own helpers (selectSearchShortcut) can be chained directly off
    // navigateToPage() - BasePage.navigateToPage returns BasePage, which would hide them.
    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsSearchManageShortcutsPage {
        super.navigateToPage(url, forceNavigation = forceNavigation, navigationOptions = navigationOptions)
        return this
    }

    /**
     * Toggles a search engine's shortcut checkbox.
     *
     * The Compose checkbox exposes no testTag or content-description, so it can only be reached by its UIAutomator
     * sibling index relative to the engine-name text node - the same handle the legacy
     * SettingsSubMenuSearchRobot.selectSearchShortcut uses. checkboxIndex is engine-specific (e.g. Reddit = 10, YouTube
     * = 13) and comes from the legacy EngineShortcut definitions.
     */
    fun selectSearchShortcut(engineName: String, checkboxIndex: Int): SettingsSearchManageShortcutsPage {
        mDevice.findObject(UiSelector().text(engineName)).getFromParent(UiSelector().index(checkboxIndex)).click()
        return this
    }
}
