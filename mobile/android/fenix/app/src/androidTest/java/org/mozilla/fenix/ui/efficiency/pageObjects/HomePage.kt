/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.filter
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeShort
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRegistry
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors

class HomePage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {

    override val pageName = "HomePage"

    init {
        NavigationRegistry.register(
            from = "AppEntry",
            to = pageName,
            steps = listOf(),
        )

        NavigationRegistry.register(
            from = pageName,
            to = "MainMenuPage",
            steps = listOf(NavigationStep.Click(HomeSelectors.MAIN_MENU_BUTTON)),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = "BookmarksPage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.BOOKMARKS_BUTTON)),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = "SettingsPage",
            steps =
                listOf(
                    NavigationStep.Swipe(MainMenuSelectors.SETTINGS_BUTTON),
                    NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
                ),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = "HistoryPage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.HISTORY_BUTTON)),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = "DownloadsPage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.DOWNLOADS_BUTTON)),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = "PasswordsPage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.PASSWORDS_BUTTON)),
        )

        NavigationRegistry.register(
            from = "MainMenuPage",
            to = pageName,
            steps = listOf(NavigationStep.PressBack),
        )
    }

    override fun mozGetSelectorsByGroup(group: String): List<Selector> {
        return HomeSelectors.all.filter { it.groups.contains(group) }
    }

    /*
     * Temporary stub for the Test Factory demo.
     *
     * This method exists only to illustrate how the `SettingsPrivateBrowsingTest`
     * (and the Test Factory pattern) would toggle Private Browsing in a real page
     * object. It is **not** connected to functional UI code and should be replaced
     * with the actual implementation when Settings pages are integrated.
     *
     * The `UnsupportedOperationException` is intentional to ensure this placeholder
     * is never used in production or non-demo tests.
     */
    @Suppress("UnusedParameter")
    fun visitWebsite(url: String) {
        throw UnsupportedOperationException("visitWebsite is not supported by ${this::class.simpleName}")
    }

    /**
     * Switch the homepage into private browsing mode and confirm it took effect. The homepage private/normal button is
     * a toggle, and the session may already be in either mode (state can leak from a prior test or run), so a single
     * blind click can land back on the normal homepage. Click, and if the private homepage card is not shown, toggle
     * once more, then assert it.
     */
    fun switchToPrivateBrowsingMode(): HomePage {
        for (attempt in 1..2) {
            mozClick(HomeSelectors.PRIVATE_BROWSING_BUTTON)
            try {
                mozVerify(HomeSelectors.PRIVATE_BROWSING_INFO_CARD_TITLE, timeout = waitingTimeShort)
                return this
            } catch (e: AssertionError) {
                if (attempt == 2) throw e
            }
        }
        return this
    }
}
