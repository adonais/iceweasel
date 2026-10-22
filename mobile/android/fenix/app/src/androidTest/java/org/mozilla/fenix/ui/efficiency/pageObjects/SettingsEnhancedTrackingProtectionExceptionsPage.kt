/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionExceptionsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.ToolbarSelectors

class SettingsEnhancedTrackingProtectionExceptionsPage(
    composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>
) : BasePage(composeRule) {
    override val pageName = "SettingsEnhancedTrackingProtectionExceptionsPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "HomePage",
            to = pageName,
            steps =
                listOf(
                    NavigationStep.Click(HomeSelectors.MAIN_MENU_BUTTON),
                    NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
                    NavigationStep.Swipe(SettingsSelectors.ENHANCED_TRACKING_PROTECTION_BUTTON),
                    NavigationStep.Click(SettingsSelectors.ENHANCED_TRACKING_PROTECTION_BUTTON),
                    NavigationStep.Click(
                        SettingsEnhancedTrackingProtectionSelectors.ENHANCED_TRACKING_PROTECTION_EXCEPTIONS_BUTTON
                    ),
                ),
        )

        builder.register(
            from = pageName,
            to = "SettingsEnhancedTrackingProtectionPage",
            steps = listOf(NavigationStep.Click(SettingsSelectors.GO_BACK_BUTTON)),
        )
    }

    override val selectorCatalog = SettingsEnhancedTrackingProtectionExceptionsSelectors

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsEnhancedTrackingProtectionExceptionsPage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    /** Verify the empty Exceptions screen: the toolbar title, the explanatory message and the Learn more link. */
    fun verifyExceptionsDefaultView(): SettingsEnhancedTrackingProtectionExceptionsPage {
        mozVerify(SettingsEnhancedTrackingProtectionExceptionsSelectors.TOOLBAR_TITLE)
        mozVerify(SettingsEnhancedTrackingProtectionExceptionsSelectors.EMPTY_MESSAGE)
        mozVerify(SettingsEnhancedTrackingProtectionExceptionsSelectors.LEARN_MORE_LINK)
        return this
    }

    /**
     * Tap the Learn more link and verify the SUMO article opens in the browser. The display-mode toolbar does not
     * surface the URL as UiAutomator-readable text, so tap the URL box into edit mode first - there the full URL is an
     * editable text field (shown immediately, before the page finishes loading), mirroring
     * SearchBarComponent.verifyUrl.
     */
    fun openExceptionsLearnMoreLink(): SettingsEnhancedTrackingProtectionExceptionsPage {
        mozClick(SettingsEnhancedTrackingProtectionExceptionsSelectors.LEARN_MORE_LINK)
        mozClick(ToolbarSelectors.TOOLBAR_URL_BOX_UIAUTOMATOR2)
        mozVerify(SettingsEnhancedTrackingProtectionExceptionsSelectors.LEARN_MORE_URL)
        return this
    }

    /** Assert the exceptions list contains (or, when [shouldExist] is false, does not contain) a row for [host]. */
    fun verifySiteExceptionExists(
        host: String,
        shouldExist: Boolean,
    ): SettingsEnhancedTrackingProtectionExceptionsPage {
        val row = SettingsEnhancedTrackingProtectionExceptionsSelectors.EXCEPTION_ROW(host)
        if (shouldExist) {
            mozVerify(row)
        } else {
            mozVerifyElementAbsent(row)
        }
        return this
    }
}
