/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessCondition
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessRule
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSiteSettingsExceptionsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSiteSettingsSelectors

class SettingsSiteSettingsExceptionsPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "SettingsSiteSettingsExceptionsPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "HomePage",
            to = pageName,
            steps =
                listOf(
                    NavigationStep.Click(HomeSelectors.MAIN_MENU_BUTTON),
                    NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
                    NavigationStep.Swipe(SettingsSelectors.SITE_SETTINGS_BUTTON),
                    NavigationStep.Click(SettingsSelectors.SITE_SETTINGS_BUTTON),
                    NavigationStep.Swipe(SettingsSiteSettingsSelectors.EXCEPTIONS_BUTTON),
                    NavigationStep.Click(SettingsSiteSettingsSelectors.EXCEPTIONS_BUTTON),
                ),
        )
    }

    override val selectorCatalog = SettingsSiteSettingsExceptionsSelectors

    override fun readinessContract() =
        super.readinessContract()
            .withRule(
                PageReadinessRule(
                    name = "site-exceptions-content-state",
                    profiles = PageReadinessProfiles.IDENTITY_ANCHOR,
                    condition =
                        PageReadinessCondition.anyOf(
                            SettingsSiteSettingsExceptionsSelectors.EMPTY_EXCEPTIONS_LIST,
                            SettingsSiteSettingsExceptionsSelectors.EXCEPTIONS_LIST,
                        ),
                )
            )
}
