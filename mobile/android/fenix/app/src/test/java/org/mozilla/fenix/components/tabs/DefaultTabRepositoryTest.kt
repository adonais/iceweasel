/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.tabs

import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.CustomTabListAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createCustomTab
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.repository.TabRepository
import org.junit.Test
import org.mozilla.fenix.ext.maxActiveTime

private const val URL = "https://www.mozilla.org"
private val EXPECTED_TAB = Tab(id = "1", url = URL, title = URL, private = false, inactive = false)

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultTabRepositoryTest {

    @Test
    fun `WHEN there are no open tabs THEN empty data is emitted`() = runTest {
        val emissions = observeTabFlow(BrowserState())

        assertEquals(expected = listOf(TabRepository.Data()), actual = emissions)
    }

    @Test
    fun `WHEN a tab is selected THEN the selected tab ID is emitted`() = runTest {
        val tab = createTab(url = URL, id = "1")
        val emissions = observeTabFlow(BrowserState(tabs = listOf(tab), selectedTabId = tab.id))

        assertEquals(expected = tab.id, actual = emissions.last().selectedTabId)
    }

    @Test
    fun `WHEN no tab is selected THEN the selected tab ID is null`() = runTest {
        val emissions = observeTabFlow(BrowserState(tabs = listOf(createTab(url = URL, id = "1"))))

        assertNull(emissions.last().selectedTabId)
    }

    @Test
    fun `WHEN a tab has a title THEN the title is used as the display title`() = runTest {
        val emissions = observeTabFlow(BrowserState(tabs = listOf(createTab(url = URL, id = "1", title = "Mozilla"))))

        assertEquals(expected = "Mozilla", actual = emissions.last().tabs.single().title)
    }

    @Test
    fun `WHEN a tab has no title THEN the URL is used as the display title`() = runTest {
        val emissions = observeTabFlow(BrowserState(tabs = listOf(createTab(url = URL, id = "1", title = ""))))

        assertEquals(expected = URL, actual = emissions.last().tabs.single().title)
    }

    @Test
    fun `WHEN a tab is private THEN it is mapped as private`() = runTest {
        val emissions = observeTabFlow(BrowserState(tabs = listOf(createTab(url = URL, id = "1", private = true))))

        assertTrue { emissions.last().tabs.single().private }
    }

    @Test
    fun `WHEN tabs are mapped THEN the order of the open tabs is preserved`() = runTest {
        val tabs = List(size = 5) { createTab(url = "$URL/$it", id = it.toString()) }
        val emissions = observeTabFlow(BrowserState(tabs = tabs))

        assertEquals(expected = tabs.map { it.id }, actual = emissions.last().tabs.map { it.id })
    }

    @Test
    fun `WHEN tabs are mapped THEN they are not assigned to a tab group`() = runTest {
        val emissions = observeTabFlow(BrowserState(tabs = listOf(createTab(url = URL, id = "1"))))

        assertNull(emissions.last().tabs.single().tabGroupId)
    }

    @Test
    fun `WHEN a tab is mapped THEN all of its displayable data is emitted`() = runTest {
        val tab = createTab(url = URL, id = "1", title = "Mozilla", private = true)
        val emissions = observeTabFlow(BrowserState(tabs = listOf(tab)))

        assertEquals(
            expected = Tab(id = "1", url = URL, title = "Mozilla", private = true, inactive = false),
            actual = emissions.last().tabs.single(),
        )
    }

    @Test
    fun `GIVEN a tab was created and last accessed before the max active time WHEN it is mapped THEN it is inactive`() =
        runTest {
            val tab = createTab(url = URL, id = "1", createdAt = expiredTime(), lastAccess = expiredTime())
            val emissions = observeTabFlow(BrowserState(tabs = listOf(tab)))

            assertTrue { emissions.last().tabs.single().inactive }
        }

    @Test
    fun `GIVEN a tab was created recently and never accessed WHEN it is mapped THEN it is active`() = runTest {
        val tab = createTab(url = URL, id = "1", createdAt = System.currentTimeMillis(), lastAccess = 0L)
        val emissions = observeTabFlow(BrowserState(tabs = listOf(tab)))

        assertFalse { emissions.last().tabs.single().inactive }
    }

    @Test
    fun `GIVEN a tab was created before the max active time but recently accessed WHEN it is mapped THEN it is active`() =
        runTest {
            val tab = createTab(url = URL, id = "1", createdAt = expiredTime(), lastAccess = System.currentTimeMillis())
            val emissions = observeTabFlow(BrowserState(tabs = listOf(tab)))

            assertFalse { emissions.last().tabs.single().inactive }
        }

    @Test
    fun `WHEN a tab is added THEN the updated tabs are emitted`() = runTest {
        val browserStore = BrowserStore(initialState = BrowserState(tabs = listOf(createTab(url = URL, id = "1"))))
        val emissions = observeTabFlow(browserStore)

        browserStore.dispatch(TabListAction.AddTabAction(tab = createTab(url = URL, id = "2")))
        runCurrent()

        assertEquals(expected = 2, actual = emissions.size)
        assertEquals(expected = listOf("1", "2"), actual = emissions.last().tabs.map { it.id })
    }

    @Test
    fun `WHEN the selected tab changes THEN the updated selection is emitted`() = runTest {
        val browserStore =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs = listOf(createTab(url = URL, id = "1"), createTab(url = URL, id = "2")),
                        selectedTabId = "1",
                    )
            )
        val emissions = observeTabFlow(browserStore)

        browserStore.dispatch(TabListAction.SelectTabAction(tabId = "2"))
        runCurrent()

        assertEquals(expected = 2, actual = emissions.size)
        assertEquals(expected = "2", actual = emissions.last().selectedTabId)
    }

    @Test
    fun `WHEN a custom tab is added THEN it is neither emitted nor does it trigger a new emission`() = runTest {
        val browserStore = BrowserStore(initialState = BrowserState(tabs = listOf(createTab(url = URL, id = "1"))))
        val emissions = observeTabFlow(browserStore)

        browserStore.dispatch(CustomTabListAction.AddCustomTabAction(tab = createCustomTab(url = URL, id = "2")))
        runCurrent()

        assertEquals(expected = listOf(TabRepository.Data(tabs = listOf(EXPECTED_TAB))), actual = emissions)
    }

    @Test
    fun `WHEN a tab changes in a way which is not displayed THEN no new emission occurs`() = runTest {
        val browserStore = BrowserStore(initialState = BrowserState(tabs = listOf(createTab(url = URL, id = "1"))))
        val emissions = observeTabFlow(browserStore)

        browserStore.dispatch(ContentAction.UpdateLoadingStateAction(sessionId = "1", loading = true))
        runCurrent()
        browserStore.dispatch(ContentAction.UpdateProgressAction(sessionId = "1", progress = 50))
        runCurrent()

        assertEquals(expected = listOf(TabRepository.Data(tabs = listOf(EXPECTED_TAB))), actual = emissions)
    }

    private fun expiredTime(): Long = System.currentTimeMillis() - maxActiveTime - TimeUnit.DAYS.toMillis(1)

    private fun TestScope.observeTabFlow(initialState: BrowserState): List<TabRepository.Data> =
        observeTabFlow(BrowserStore(initialState = initialState))

    private fun TestScope.observeTabFlow(browserStore: BrowserStore): List<TabRepository.Data> {
        val emissions = mutableListOf<TabRepository.Data>()
        backgroundScope.launch { DefaultTabRepository(browserStore = browserStore).tabFlow.toList(emissions) }
        runCurrent()

        return emissions
    }
}
