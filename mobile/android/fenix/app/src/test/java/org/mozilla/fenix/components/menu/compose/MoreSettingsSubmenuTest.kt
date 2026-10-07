/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.fenix.components.menu.compose

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.Test
import kotlin.test.assertTrue
import mozilla.components.compose.base.theme.Theme
import mozilla.components.support.test.robolectric.testContext
import org.junit.Rule
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.SummarizationMenuState
import org.mozilla.fenix.components.menu.store.TranslationInfo
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class MoreSettingsSubmenuTest {
    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `GIVEN showGroupsInMenu is enabled, THEN add to tab group option renders`() {
        renderContentUnderTest(showGroupsInMenu = true)
        composeTestRule
            .onNodeWithText(testContext.getString(R.string.browser_menu_add_to_tab_group), useUnmergedTree = true)
            .assertExists()
    }

    @Test
    fun `GIVEN showGroupsInMenu is disabled, THEN add to tab group option does not render`() {
        renderContentUnderTest(showGroupsInMenu = false)
        composeTestRule
            .onNodeWithText(testContext.getString(R.string.browser_menu_add_to_tab_group), useUnmergedTree = true)
            .assertDoesNotExist()
    }

    @Test
    fun `GIVEN showGroupsInMenu is enabled, WHEN item is tapped THEN callback fires`() {
        var menuItemPressed = false
        renderContentUnderTest(
            showGroupsInMenu = true,
            onAddToGroupCLick = {
                menuItemPressed = true
            },
        )
        val label = testContext.getString(R.string.browser_menu_add_to_tab_group)
        composeTestRule.onNodeWithText(label, useUnmergedTree = true).assertExists()
        composeTestRule.onNodeWithText(label, useUnmergedTree = true).performClick()
        assertTrue(menuItemPressed, "Menu item was pressed.")
    }

    private fun renderContentUnderTest(showGroupsInMenu: Boolean = false, onAddToGroupCLick: () -> Unit = {}) {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                MoreSettingsSubmenu(
                    isPinned = false,
                    isInstallable = false,
                    isAddToHomeScreenSupported = false,
                    hasExternalApp = false,
                    externalAppName = "FirefoxTest",
                    isReaderViewActive = false,
                    isWebCompatEnabled = false,
                    isOpenInAppMenuHighlighted = false,
                    translationInfo =
                        TranslationInfo(
                            isTranslationSupported = false,
                            isPdf = false,
                            isTranslated = false,
                            translatedLanguage = "",
                            onTranslatePageMenuClick = {},
                        ),
                    showShortcuts = false,
                    showSaveToCollection = false,
                    isAndroidAutomotiveAvailable = false,
                    summarizationMenuState = SummarizationMenuState.Default,
                    isPrivate = false,
                    showTabGroupsInMenu = showGroupsInMenu,
                    onWebCompatReporterClick = {},
                    onSummarizePageMenuExposed = {},
                    onSummarizePageClick = {},
                    onShortcutsMenuClick = {},
                    onAddToHomeScreenMenuClick = {},
                    onSaveToCollectionMenuClick = {},
                    onSaveAsPDFMenuClick = {},
                    onPrintMenuClick = {},
                    onOpenInAppMenuClick = {},
                    onMoveToNonPrivateTabMenuClick = {},
                    onAddToTabGroupClick = onAddToGroupCLick,
                )
            }
        }
    }
}
