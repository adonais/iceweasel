/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onAllNodesWithTag
import mozilla.components.browser.state.selector.selectedTab
import org.mozilla.fenix.components.menu.MenuDialogTestTag
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.Constants.recommendedAddons
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeLong
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageStateTracker
import org.mozilla.fenix.ui.efficiency.navigation.NavigationArrival
import org.mozilla.fenix.ui.efficiency.navigation.NavigationFacts
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.BrowserPageSelectors
import org.mozilla.fenix.ui.efficiency.selectors.HomeSelectors
import org.mozilla.fenix.ui.efficiency.selectors.MainMenuSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAddonsManagerSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSavedPasswordsSelectors

class MainMenuPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {
    override val pageName = "MainMenuPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "HomePage",
            to = pageName,
            steps = listOf(NavigationStep.Click(HomeSelectors.MAIN_MENU_BUTTON)),
        )

        builder.register(
            from = "BrowserPage",
            to = pageName,
            steps = listOf(NavigationStep.Click(BrowserPageSelectors.MAIN_MENU_BUTTON)),
        )

        builder.register(
            from = pageName,
            to = "BrowserPage",
            steps = listOf(),
            arrival = NavigationArrival.EDGE_COMPLETION,
            requires = setOf(NavigationFacts.RETURN_SURFACE_BROWSER),
        )

        builder.register(
            from = pageName,
            to = "HomePage",
            steps = listOf(NavigationStep.PressBack),
            requires = setOf(NavigationFacts.RETURN_SURFACE_HOME),
        )

        builder.register(
            from = pageName,
            to = "SettingsPage",
            steps =
                listOf(
                    NavigationStep.Swipe(MainMenuSelectors.SETTINGS_BUTTON),
                    NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
                ),
        )

        // "Customize homepage" is only present in the home main menu and jumps straight to the homepage settings
        // screen, one level shallower than the Settings -> Homepage route.
        builder.register(
            from = pageName,
            to = "SettingsHomepagePage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.CUSTOMIZE_HOMEPAGE_BUTTON)),
        )

        builder.register(
            from = pageName,
            to = "DownloadsPage",
            steps = listOf(NavigationStep.Click(MainMenuSelectors.DOWNLOADS_BUTTON)),
        )

        builder.register(
            from = pageName,
            to = "SettingsSavedPasswordsPage",
            steps =
                listOf(
                    NavigationStep.Click(MainMenuSelectors.PASSWORDS_BUTTON),
                    NavigationStep.ClickIfPresent(
                        SettingsSavedPasswordsSelectors.LOGINS_SECURITY_DIALOG_LATER_BUTTON,
                        timeout = 5_000,
                    ),
                ),
        )
    }

    override val selectorCatalog = MainMenuSelectors

    /**
     * An extension installed by [installFirstRecommendedExtension].
     *
     * AMO's listing name, shown in the recommendations, often differs from the names the app shows once the extension
     * is installed, so callers must use the name matching the surface they check.
     *
     * @property id The installed extension's id.
     */
    class InstalledExtension(val id: String) {
        private val state
            get() = requireNotNull(appContext.components.core.store.state.extensions[id]) { "Extension $id not found" }

        /** The manifest name, shown by the install prompts and the add-ons manager. */
        val name: String
            get() = state.name ?: id

        /**
         * The label of the extension's main menu entry: its toolbar button title as overridden for the selected tab
         * (e.g. NoScript drops its version there), falling back to [name].
         */
        val menuLabel: String
            get() {
                val tabAction =
                    appContext.components.core.store.state.selectedTab?.extensionState?.get(id)?.browserAction
                return state.browserAction?.copyWithOverride(tabAction)?.title?.takeUnless { it.isBlank() } ?: name
            }
    }

    /**
     * Installs a recommended extension from the expanded Extensions submenu. The submenu must already be expanded
     * (click [MainMenuSelectors.EXTENSIONS_BUTTON_UIAUTOMATOR]) before calling.
     *
     * Which extensions AMO recommends is server-driven, so this prefers one on [recommendedAddons], which are known to
     * add a menu entry, and otherwise installs the first one shown. Extensions without a toolbar button leave the
     * Extensions row reading "No extensions enabled", so checks on the menu entry fail on that fallback.
     */
    fun installFirstRecommendedExtension(): InstalledExtension {
        // The recommendation list is fetched from AMO asynchronously, so wait for a row before reading it.
        // Unmerged tree: the title tag is merged into the row's semantics and hidden from the default tree.
        mozVerify(MainMenuSelectors.RECOMMENDED_ADDON_ITEM)
        val listedTitles =
            composeRule
                .onAllNodesWithTag(MenuDialogTestTag.RECOMMENDED_ADDON_ITEM_TITLE, useUnmergedTree = true)
                .fetchSemanticsNodes()
                .map { it.config[SemanticsProperties.Text].first().text }
        val listingTitle =
            listedTitles.firstOrNull { title -> recommendedAddons.any { title.contains(it) } } ?: listedTitles.first()

        val extensionsBefore = appContext.components.core.store.state.extensions.keys
        mozClick(MainMenuSelectors.RECOMMENDED_ADDON_INSTALL_BUTTON(listingTitle))
        // Matched on the Add button rather than the prompt title: the prompt shows the manifest name, which can
        // differ from the listing name. The button is disabled for ~1s after the prompt appears (mirrors the legacy
        // allowPermissionToInstall).
        mozClickWhenEnabled(SettingsAddonsManagerSelectors.ADDON_PERMISSION_ALLOW_BUTTON, timeout = waitingTimeLong)
        composeRule.waitUntil(waitingTimeLong) {
            (appContext.components.core.store.state.extensions.keys - extensionsBefore).isNotEmpty()
        }
        val extension =
            InstalledExtension((appContext.components.core.store.state.extensions.keys - extensionsBefore).first())
        mozVerify(
            SettingsAddonsManagerSelectors.ADDON_INSTALL_COMPLETED_TITLE(extension.name),
            timeout = waitingTimeLong,
        )
        // Some extensions (e.g. NoScript) auto-open an onboarding tab on install, which dismisses the
        // "<addon> was added" dialog out from under us. Closing it is therefore best-effort: if the tab
        // already tore the dialog down, clicking OK is a no-op rather than a "Failed to click UiObject"
        // failure. Mirrors the legacy closeAddonInstallCompletePrompt, which ignored the click result.
        mozClickIfPresent(SettingsAddonsManagerSelectors.ADDON_INSTALL_COMPLETED_OK_BUTTON)
        PageStateTracker.currentPageName = "BrowserPage"
        return extension
    }
}
