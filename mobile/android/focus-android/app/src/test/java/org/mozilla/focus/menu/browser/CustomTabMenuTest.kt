/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.browser

import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.WebExtensionAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.CustomTabConfig
import mozilla.components.browser.state.state.CustomTabMenuItem
import mozilla.components.browser.state.state.WebExtensionState
import mozilla.components.browser.state.state.createCustomTab
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.ui.MenuItemIcon
import mozilla.components.compose.menu.ui.MenuItemIconDrawable
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.concept.engine.webextension.Action
import mozilla.components.feature.webcompat.reporter.WebCompatReporterFeature.WEBCOMPAT_REPORTER_EXTENSION_ID
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.focus.R
import org.mozilla.focus.menu.CustomTabMenuItemTapped
import org.mozilla.focus.menu.MenuItemTapped
import org.mozilla.focus.menu.ToolbarMenu.CustomTabItem
import org.robolectric.RobolectricTestRunner

private const val APP_NAME = "Focus"

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class CustomTabMenuTest {
    private val customTab = createCustomTab("https://mozilla.org", id = "customTab")
    private val selectedTab = createTab("https://example.org", id = "tab", private = true)
    private val browserState =
        BrowserState(
            tabs = listOf(selectedTab),
            customTabs = listOf(customTab),
            selectedTabId = selectedTab.id,
        )

    @Test
    fun `WHEN not an onboarding tab THEN allow opening the page somewhere else`() {
        val items = menu(isOnboardingTab = false).currentMenuGroups().flatMap { it.items }

        assertTrue(items.hasItem(CustomTabItem.OpenInBrowser))
        assertTrue(items.hasItem(CustomTabItem.OpenInApp))
        assertEquals(
            Text.Resource(R.string.menu_open_with_default_browser2, listOf(APP_NAME)),
            items.item(CustomTabItem.OpenInBrowser).title,
        )
    }

    @Test
    fun `WHEN an onboarding tab THEN keep the page inside the custom tab`() {
        val items = menu(isOnboardingTab = true).currentMenuGroups().flatMap { it.items }

        assertFalse(items.hasItem(CustomTabItem.OpenInBrowser))
        assertFalse(items.hasItem(CustomTabItem.OpenInApp))
        assertTrue(items.hasItem(CustomTabItem.FindInPage))
        assertTrue(items.hasItem(CustomTabItem.AddToHomeScreen))
    }

    @Test
    fun `GIVEN a different selected tab WHEN building the menu THEN describe the custom tab`() {
        val state =
            browserState.copy(
                customTabs =
                    listOf(customTab.copy(content = customTab.content.copy(canGoBack = true, desktopMode = true))),
                tabs =
                    listOf(
                        selectedTab.copy(
                            content = selectedTab.content.copy(canGoBack = false, desktopMode = false, loading = true)
                        )
                    ),
            )
        val items = menu(state).currentMenuGroups().flatMap { it.items }

        assertEquals(MenuItemState.DEFAULT, items.item(CustomTabItem.Back).state)
        assertEquals(MenuItemState.ACTIVE, items.item(CustomTabItem.RequestDesktop(isChecked = false)).state)
        assertTrue(items.hasItem(CustomTabItem.Reload))
        assertFalse(items.hasItem(CustomTabItem.Stop))
    }

    @Test
    fun `GIVEN items provided by the caller WHEN building the menu THEN show them after the other ones`() {
        val callerItem = CustomTabMenuItem(name = "Open in caller", pendingIntent = mock())
        val state =
            browserState.copy(
                customTabs = listOf(customTab.copy(config = CustomTabConfig(menuItems = listOf(callerItem))))
            )
        val groups = menu(state).currentMenuGroups()
        val callerItems = groups.last().items

        assertTrue(groups.dropLast(1).flatMap { it.items }.none { it.onClickEvent is CustomTabMenuItemTapped })
        assertEquals(Text.String("Open in caller"), callerItems.single().title)
        assertEquals(CustomTabMenuItemTapped(callerItem), callerItems.single().onClickEvent)
    }

    @Test
    fun `GIVEN an enabled reporter WHEN building the menu THEN report the custom tab`() {
        val action = Action("Report broken site…", true, null, null, null, null) {}
        val extension =
            WebExtensionState(
                id = WEBCOMPAT_REPORTER_EXTENSION_ID,
                allowedInPrivateBrowsing = true,
                pageAction = action.copy(enabled = false),
            )
        val state =
            browserState.copy(
                extensions = mapOf(extension.id to extension),
                customTabs =
                    listOf(customTab.copy(extensionState = mapOf(extension.id to extension.copy(pageAction = action)))),
            )

        assertEquals(action, state.webCompatReporterAction(state.customTabs.single()))
        assertEquals(
            Text.String("Report broken site…"),
            menu(state).currentMenuGroups().flatMap { it.items }.item(CustomTabItem.ReportSiteIssue).title,
        )
    }

    @Test
    fun `GIVEN the reporter starts up while the custom tab menu is shown THEN load its own icon once`() = runTest {
        val icon = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        var iconLoads = 0
        val action =
            Action("Report broken site…", true, null, null, null, null) {}
                .copy(
                    loadIcon = {
                        iconLoads++
                        icon
                    }
                )
        val extension =
            WebExtensionState(
                id = WEBCOMPAT_REPORTER_EXTENSION_ID,
                allowedInPrivateBrowsing = true,
                pageAction = action,
            )
        val store =
            BrowserStore(
                browserState.copy(
                    customTabs = listOf(customTab.copy(extensionState = mapOf(extension.id to extension)))
                )
            )
        val menu =
            CustomTabMenu(
                browserStore = store,
                customTabId = customTab.id,
                appName = APP_NAME,
                isOnboardingTab = false,
                context = testContext,
            )
        var groups = emptyList<MenuItemsGroup>()
        backgroundScope.launch { menu.menuGroups.collect { groups = it } }
        runCurrent()
        assertFalse(groups.flatMap { it.items }.hasItem(CustomTabItem.ReportSiteIssue))
        assertEquals(0, iconLoads)

        store.dispatch(
            WebExtensionAction.InstallWebExtensionAction(
                extension.copy(pageAction = action.copy(enabled = false, loadIcon = null))
            )
        )
        runCurrent()

        assertEquals(icon, groups.flatMap { it.items }.item(CustomTabItem.ReportSiteIssue).icon.bitmap)
        assertEquals(1, iconLoads)

        store.dispatch(ContentAction.UpdateLoadingStateAction(customTab.id, true))
        runCurrent()
        assertEquals(1, iconLoads)
        assertEquals(
            icon,
            menu.currentMenuGroups().flatMap { it.items }.item(CustomTabItem.ReportSiteIssue).icon.bitmap,
        )
    }

    @Test
    fun `WHEN building the menu THEN attribute it to this application below its items`() {
        val attribution = menu().attribution

        assertEquals(Text.Resource(R.string.menu_custom_tab_branding, listOf(APP_NAME)), attribution.title)
        assertFalse(attribution.showAtTop)
    }

    private fun menu(
        state: BrowserState = browserState,
        isOnboardingTab: Boolean = false,
    ) =
        CustomTabMenu(
            browserStore = BrowserStore(state),
            customTabId = customTab.id,
            appName = APP_NAME,
            isOnboardingTab = isOnboardingTab,
            context = mock(),
        )

    private val MenuItemIcon?.bitmap
        get() = ((this as MenuItemIconDrawable).icon as BitmapDrawable).bitmap

    private fun List<MenuItem>.item(item: CustomTabItem) = single { it.onClickEvent == MenuItemTapped(item) }

    private fun List<MenuItem>.hasItem(item: CustomTabItem) = any { it.onClickEvent == MenuItemTapped(item) }
}
