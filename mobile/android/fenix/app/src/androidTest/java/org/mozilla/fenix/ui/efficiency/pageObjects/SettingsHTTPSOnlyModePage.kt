/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsHTTPSOnlyModeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsHTTPSOnlyModePage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "SettingsHTTPSOnlyModePage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "HomePage",
            to = pageName,
            steps =
                listOf(
                    NavigationStep.Click(HomeSelectors.MAIN_MENU_BUTTON),
                    NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
                    NavigationStep.Swipe(SettingsSelectors.HTTPS_ONLY_MODE_BUTTON),
                    NavigationStep.Click(SettingsSelectors.HTTPS_ONLY_MODE_BUTTON),
                ),
        )

        builder.register(
            from = pageName,
            to = "SettingsPage",
            steps = listOf(NavigationStep.Click(SettingsSelectors.GO_BACK_BUTTON)),
        )
    }

    override val selectorCatalog = SettingsHTTPSOnlyModeSelectors

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsHTTPSOnlyModePage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    fun enableHttpsOnlyMode(): SettingsHTTPSOnlyModePage {
        if (!appContext.components.settings.shouldUseHttpsOnly) {
            mozClick(SettingsHTTPSOnlyModeSelectors.HTTPS_ONLY_MODE_TOGGLE)
        }
        return this
    }

    fun verifyHttpsOnlyAllTabsSelected(): SettingsHTTPSOnlyModePage {
        mozVerifyElementIsChecked(SettingsHTTPSOnlyModeSelectors.HTTPS_ONLY_ALL_TABS_OPTION)
        mozVerifyElementIsNotChecked(SettingsHTTPSOnlyModeSelectors.HTTPS_ONLY_PRIVATE_TABS_OPTION)
        return this
    }
}
