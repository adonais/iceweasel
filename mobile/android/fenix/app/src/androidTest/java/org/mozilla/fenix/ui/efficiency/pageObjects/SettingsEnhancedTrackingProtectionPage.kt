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
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionBlockingSelectors as Blocking
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionSelectors as ETP
import org.mozilla.fenix.ui.efficiency.selectors.SettingsEnhancedTrackingProtectionSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsEnhancedTrackingProtectionPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "SettingsEnhancedTrackingProtectionPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        // Arrival from HomePage is composed via SettingsPage, which owns the Settings -> sub-page edge.
        builder.register(
            from = pageName,
            to = "SettingsPage",
            steps = listOf(NavigationStep.Click(SettingsSelectors.GO_BACK_BUTTON)),
        )
    }

    override val selectorCatalog = SettingsEnhancedTrackingProtectionSelectors

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): SettingsEnhancedTrackingProtectionPage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    /**
     * Verify every item on the sub-menu: the title and summary, the Learn more link, the Enhanced Tracking Protection
     * toggle (on by default) with its summary, the Standard (selected) / Strict / Custom options each with a summary
     * and an info button, the Global Privacy Control toggle (off by default) and the Exceptions entry.
     */
    fun verifySubMenuItemsDisplayed(): SettingsEnhancedTrackingProtectionPage {
        mozVerify(ETP.TOOLBAR_TITLE)
        mozVerify(ETP.ENHANCED_TRACKING_PROTECTION_SUMMARY)
        mozVerify(ETP.LEARN_MORE_LINK)
        mozVerifyElementIsChecked(ETP.ENHANCED_TRACKING_PROTECTION_TOGGLE)
        mozVerify(ETP.ENHANCED_TRACKING_PROTECTION_TOGGLE_SUMMARY)
        mozVerify(ETP.STANDARD_OPTION)
        mozVerify(ETP.STANDARD_OPTION_SUMMARY)
        mozVerify(ETP.STANDARD_INFO_BUTTON)
        mozVerifyElementHasCheckedSiblingByResName(ETP.STANDARD_OPTION, "radio_button")
        mozVerify(ETP.STRICT_OPTION)
        mozVerify(ETP.STRICT_OPTION_SUMMARY)
        mozVerify(ETP.STRICT_INFO_BUTTON)
        mozVerify(ETP.CUSTOM_OPTION)
        mozVerify(ETP.CUSTOM_OPTION_SUMMARY)
        mozVerify(ETP.CUSTOM_INFO_BUTTON)
        mozVerifyOptionSwitchIsNotChecked(ETP.GLOBAL_PRIVACY_CONTROL_TOGGLE)
        mozVerify(ETP.ENHANCED_TRACKING_PROTECTION_EXCEPTIONS_BUTTON)
        return this
    }

    /** Confirm Standard is the currently selected protection level (its radio button is checked). */
    fun verifyStandardOptionSelected(): SettingsEnhancedTrackingProtectionPage {
        mozVerifyElementHasCheckedSiblingByResName(ETP.STANDARD_OPTION, "radio_button")
        return this
    }

    fun toggleEnhancedTrackingProtection(): SettingsEnhancedTrackingProtectionPage {
        mozClick(ETP.ENHANCED_TRACKING_PROTECTION_TOGGLE)
        return this
    }

    /** Assert the Standard/Strict/Custom protection levels are enabled (or greyed out, when [enabled] is false). */
    fun verifyProtectionLevelsEnabled(enabled: Boolean): SettingsEnhancedTrackingProtectionPage {
        if (enabled) {
            mozVerifyElementIsEnabled(ETP.STANDARD_OPTION)
            mozVerifyElementIsEnabled(ETP.STRICT_OPTION)
            mozVerifyElementIsEnabled(ETP.CUSTOM_OPTION)
        } else {
            mozVerifyElementIsNotEnabled(ETP.STANDARD_OPTION)
            mozVerifyElementIsNotEnabled(ETP.STRICT_OPTION)
            mozVerifyElementIsNotEnabled(ETP.CUSTOM_OPTION)
        }
        return this
    }

    /**
     * Open the Standard option's "What's blocked" info screen, verify the tracker categories it lists (Tracking Content
     * is not blocked by Standard, so it is absent), then return to the sub-menu.
     */
    fun openStandardInfoAndVerifyBlockedTrackers(): SettingsEnhancedTrackingProtectionPage {
        mozClick(ETP.STANDARD_INFO_BUTTON)
        mozVerify(Blocking.SOCIAL_MEDIA_TRACKERS)
        mozVerify(Blocking.CROSS_SITE_COOKIES)
        mozVerify(Blocking.CRYPTOMINERS)
        mozVerify(Blocking.KNOWN_FINGERPRINTERS)
        mozVerify(Blocking.REDIRECT_TRACKERS)
        mozVerify(Blocking.SUSPECTED_FINGERPRINTERS)
        mozPressBack()
        return this
    }

    /** Open the Strict option's "What's blocked" info screen, verify its tracker categories, then return. */
    fun openStrictInfoAndVerifyBlockedTrackers(): SettingsEnhancedTrackingProtectionPage {
        mozClick(ETP.STRICT_INFO_BUTTON)
        mozVerify(Blocking.SOCIAL_MEDIA_TRACKERS)
        mozVerify(Blocking.CROSS_SITE_COOKIES)
        mozVerify(Blocking.CRYPTOMINERS)
        mozVerify(Blocking.KNOWN_FINGERPRINTERS)
        mozVerify(Blocking.TRACKING_CONTENT)
        mozVerify(Blocking.REDIRECT_TRACKERS)
        mozVerify(Blocking.SUSPECTED_FINGERPRINTERS)
        mozPressBack()
        return this
    }

    /** Open the Custom option's "What's blocked" info screen, verify its tracker categories, then return. */
    fun openCustomInfoAndVerifyBlockedTrackers(): SettingsEnhancedTrackingProtectionPage {
        mozClick(ETP.CUSTOM_INFO_BUTTON)
        mozVerify(Blocking.SOCIAL_MEDIA_TRACKERS)
        mozVerify(Blocking.CROSS_SITE_COOKIES)
        mozVerify(Blocking.CRYPTOMINERS)
        mozVerify(Blocking.KNOWN_FINGERPRINTERS)
        mozVerify(Blocking.TRACKING_CONTENT)
        mozVerify(Blocking.REDIRECT_TRACKERS)
        mozVerify(Blocking.SUSPECTED_FINGERPRINTERS)
        mozPressBack()
        return this
    }

    fun openExceptions(): SettingsEnhancedTrackingProtectionPage {
        mozClick(ETP.ENHANCED_TRACKING_PROTECTION_EXCEPTIONS_BUTTON)
        return this
    }
}
