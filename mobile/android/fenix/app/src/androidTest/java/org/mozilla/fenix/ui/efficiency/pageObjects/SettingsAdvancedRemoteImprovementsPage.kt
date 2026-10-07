/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAdvancedRemoteImprovementsSelectors

class SettingsAdvancedRemoteImprovementsPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {

    override val pageName = "SettingsAdvancedRemoteImprovementsPage"

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsAdvancedRemoteImprovementsPage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    override val selectorCatalog = SettingsAdvancedRemoteImprovementsSelectors
}
