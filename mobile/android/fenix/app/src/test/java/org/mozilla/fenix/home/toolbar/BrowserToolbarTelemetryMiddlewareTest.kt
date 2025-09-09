/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

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
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.home.toolbar.BrowserToolbarTelemetryMiddleware.ToolbarActionRecord
import org.mozilla.fenix.home.toolbar.DisplayActions.MenuClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterLongClicked

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
