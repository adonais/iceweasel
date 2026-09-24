/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import io.mockk.every
import io.mockk.mockk
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.tabs.TabsUseCases
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.utils.Settings

class TabsUseCasesTest {

    @Test
    fun `GIVEN inactiveTabs feature is enabled WHEN removeAllActiveNormalTabs is called THEN remove the active normal tabs and exclude the inactive ones`() {
        val activeTab1 = createTab(url = "url1", id = "active1")
        val activeTab2 = createTab(url = "url2", id = "active2")
        val inactiveTab = createTab(url = "url3", id = "inactive", lastAccess = 0L, createdAt = 0L)
        val privateTab = createTab(url = "url4", id = "private", private = true, lastAccess = 0L, createdAt = 0L)

        val settings: Settings = mockk {
            every { inactiveTabsAreEnabled } returns true
        }

        val state = BrowserState(tabs = listOf(activeTab1, inactiveTab, activeTab2, privateTab))
        val store = BrowserStore(initialState = state)
        val tabsUseCases = TabsUseCases(store)

        val result = tabsUseCases.removeAllActiveNormalTabs(state = state, settings = settings)

        assertEquals(2, result)
        assertEquals(store.state.tabs, listOf(inactiveTab, privateTab))
    }

    @Test
    fun `GIVEN inactiveTabs feature is disabled WHEN removeAllActiveNormalTabs is called THEN remove all of the normal tabs`() {
        val activeTab1 = createTab(url = "url1", id = "active1")
        val activeTab2 = createTab(url = "url2", id = "active2")
        val activeTab3 = createTab(url = "url3", id = "active3", lastAccess = 0L, createdAt = 0L)
        val privateTab = createTab(url = "url4", id = "private", private = true, lastAccess = 0L, createdAt = 0L)
        val settings: Settings = mockk {
            every { inactiveTabsAreEnabled } returns false
        }

        val state = BrowserState(tabs = listOf(activeTab1, activeTab3, activeTab2, privateTab))
        val store = BrowserStore(initialState = state)
        val tabsUseCases = TabsUseCases(store)

        val result = tabsUseCases.removeAllActiveNormalTabs(state = state, settings = settings)

        assertEquals(3, result)
        assertEquals(store.state.tabs, listOf(privateTab))
    }

    @Test
    fun `GIVEN no normal tabs are open WHEN removeAllActiveNormalTabs is called THEN remove nothing`() {
        val privateTab = createTab(url = "url1", id = "1", private = true)
        val settings: Settings = mockk {
            every { inactiveTabsAreEnabled } returns true
        }

        val state = BrowserState(tabs = listOf(privateTab))
        val store = BrowserStore(initialState = state)
        val tabsUseCases = TabsUseCases(store)

        val result = tabsUseCases.removeAllActiveNormalTabs(state = state, settings = settings)

        assertEquals(0, result)
        assertEquals(store.state.tabs, listOf(privateTab))
    }
}
