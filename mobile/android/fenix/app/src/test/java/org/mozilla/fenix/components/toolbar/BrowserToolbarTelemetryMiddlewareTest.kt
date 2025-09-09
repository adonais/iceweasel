/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent.Source
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.components.toolbar.BrowserToolbarTelemetryMiddleware.ToolbarActionRecord
import org.mozilla.fenix.components.toolbar.DisplayActions.AddBookmarkClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.EditBookmarkClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.MenuClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.NavigateBackClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.NavigateBackLongClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.NavigateForwardClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.NavigateForwardLongClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.RefreshClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.ShareClicked
import org.mozilla.fenix.components.toolbar.DisplayActions.StopRefreshClicked
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.TabCounterLongClicked
import org.mozilla.fenix.helpers.FenixGleanTestRule

@RunWith(AndroidJUnit4::class)
class BrowserToolbarTelemetryMiddlewareTest {
    @get:Rule
    val gleanRule = FenixGleanTestRule(testContext)

    @Test
    fun `WHEN menu button is clicked THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(MenuClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.MenuClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(MenuClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.MenuClicked.action)
    }

    @Test
    fun `WHEN tab counter is clicked THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(TabCounterClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.TabCounterClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(TabCounterClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.TabCounterClicked.action)
    }

    @Test
    fun `WHEN tab counter is long clicked THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(TabCounterLongClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.TabCounterLongClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(TabCounterLongClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.TabCounterLongClicked.action)
    }

    @Test
    fun `WHEN adding a new tab THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(AddNewTab(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddNewTab.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(AddNewTab(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddNewTab.action)
    }

    @Test
    fun `WHEN adding a new private tab THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(AddNewPrivateTab(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddNewPrivateTab.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(AddNewPrivateTab(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddNewPrivateTab.action)
    }

    @Test
    fun `WHEN navigating back THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(NavigateBackClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateBackClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN navigating back is long clicked THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(NavigateBackLongClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateBackLongClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN navigating forward THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(NavigateForwardClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateForwardClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN navigating forward is long clicked THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(NavigateForwardLongClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateForwardLongClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN refreshing the page THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(RefreshClicked(bypassCache = false)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.RefreshClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN refreshing the page is stopped THEN record addressBar telemetry`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(StopRefreshClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.StopRefreshClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())
    }

    @Test
    fun `WHEN adding a bookmark THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(AddBookmarkClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddBookmarkClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(AddBookmarkClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddBookmarkClicked.action)
    }

    @Test
    fun `WHEN navigating to edit a bookmark THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(EditBookmarkClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.EditBookmarkClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(EditBookmarkClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.EditBookmarkClicked.action)
    }

    @Test
    fun `WHEN sharing a page THEN record telemetry based on addressBar or navbar source`() {
        assertNull(Events.browserToolbarAction.testGetValue())

        buildStore.dispatch(ShareClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.ShareClicked.action)

        assertNull(Events.browserNavbarAction.testGetValue())

        buildStore.dispatch(ShareClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.ShareClicked.action)
    }

    private fun assertTelemetryRecorded(
        source: Source,
        item: String,
    ) {
        val event = if (source == Source.AddressBar) {
            Events.browserToolbarAction
        } else {
            Events.browserNavbarAction
        }
        assertNotNull(event.testGetValue())

        val snapshot = event.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals(item, snapshot.single().extra?.getValue("item"))
    }

    private val buildStore = BrowserToolbarStore(
        middleware = listOf(BrowserToolbarTelemetryMiddleware()),
    )
}
