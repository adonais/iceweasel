/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.SettingsCustomizeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsCustomizePage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "SettingsCustomizePage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = pageName,
            to = "SettingsPage",
            steps = listOf(NavigationStep.Click(SettingsSelectors.GO_BACK_BUTTON)),
        )
    }

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsCustomizePage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    fun verifyOptionIsSelected(selector: Selector): SettingsCustomizePage {
        mozVerifyElementHasCheckedSiblingByResName(selector, "radio_button")
        return this
    }

    override val selectorCatalog = SettingsCustomizeSelectors
}
