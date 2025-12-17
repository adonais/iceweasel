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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Toolbar
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
import org.mozilla.fenix.components.toolbar.StartPageActions.SiteInfoClicked
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.components.toolbar.TabCounterInteractions.TabCounterLongClicked
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.telemetry.SOURCE_ADDRESS_BAR
import org.mozilla.fenix.telemetry.SOURCE_NAVIGATION_BAR

@RunWith(AndroidJUnit4::class)
class BrowserToolbarTelemetryMiddlewareTest {
    @get:Rule
    val gleanRule = FenixGleanTestRule(testContext)

    @Test
    fun `WHEN menu button is clicked THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(MenuClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.MenuClicked.action)

        buildStore.dispatch(MenuClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.MenuClicked.action)
    }

    @Test
    fun `WHEN tab counter is clicked THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(TabCounterClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.TabCounterClicked.action)

        buildStore.dispatch(TabCounterClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.TabCounterClicked.action)
    }

    @Test
    fun `WHEN tab counter is long clicked THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(TabCounterLongClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.TabCounterLongClicked.action)

        buildStore.dispatch(TabCounterLongClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.TabCounterLongClicked.action)
    }

    @Test
    fun `WHEN adding a new tab THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(AddNewTab(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddNewTab.action)

        buildStore.dispatch(AddNewTab(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddNewTab.action)
    }

    @Test
    fun `WHEN adding a new private tab THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(AddNewPrivateTab(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddNewPrivateTab.action)

        buildStore.dispatch(AddNewPrivateTab(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddNewPrivateTab.action)
    }

    @Test
    fun `WHEN navigating back THEN record addressBar telemetry`() {
        buildStore.dispatch(NavigateBackClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateBackClicked.action)
    }

    @Test
    fun `WHEN navigating back is long clicked THEN record addressBar telemetry`() {
        buildStore.dispatch(NavigateBackLongClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateBackLongClicked.action)
    }

    @Test
    fun `WHEN navigating forward THEN record addressBar telemetry`() {
        buildStore.dispatch(NavigateForwardClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateForwardClicked.action)
    }

    @Test
    fun `WHEN navigating forward is long clicked THEN record addressBar telemetry`() {
        buildStore.dispatch(NavigateForwardLongClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.NavigateForwardLongClicked.action)
    }

    @Test
    fun `WHEN refreshing the page THEN record addressBar telemetry`() {
        buildStore.dispatch(RefreshClicked(bypassCache = false)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.RefreshClicked.action)
    }

    @Test
    fun `WHEN refreshing the page is stopped THEN record addressBar telemetry`() {
        buildStore.dispatch(StopRefreshClicked).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.StopRefreshClicked.action)
    }

    @Test
    fun `WHEN adding a bookmark THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(AddBookmarkClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.AddBookmarkClicked.action)

        buildStore.dispatch(AddBookmarkClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.AddBookmarkClicked.action)
    }

    @Test
    fun `WHEN navigating to edit a bookmark THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(EditBookmarkClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.EditBookmarkClicked.action)

        buildStore.dispatch(EditBookmarkClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.EditBookmarkClicked.action)
    }

    @Test
    fun `WHEN sharing a page THEN record telemetry based on addressBar or navbar source`() {
        buildStore.dispatch(ShareClicked(Source.AddressBar)).joinBlocking()
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.ShareClicked.action)

        buildStore.dispatch(ShareClicked(Source.NavigationBar)).joinBlocking()
        assertTelemetryRecorded(Source.NavigationBar, item = ToolbarActionRecord.ShareClicked.action)
    }

    @Test
    fun `WHEN site info is clicked THEN record addressBar telemetry`() {
        buildStore.dispatch(SiteInfoClicked)
        assertTelemetryRecorded(Source.AddressBar, item = ToolbarActionRecord.SecurityIndicatorClicked.action)
    }

    private fun assertTelemetryRecorded(
        source: Source,
        item: String,
    ) {
        assertNotNull(Toolbar.buttonTapped.testGetValue())
        val snapshot = Toolbar.buttonTapped.testGetValue()!!
        val last = snapshot.last()
        val expectedSource = if (source == Source.AddressBar) SOURCE_ADDRESS_BAR else SOURCE_NAVIGATION_BAR
        assertEquals(item, last.extra?.getValue("item"))
        assertEquals(expectedSource, last.extra?.getValue("source"))
    }

    private val buildStore = BrowserToolbarStore(
        middleware = listOf(BrowserToolbarTelemetryMiddleware()),
    )
}
