/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import androidx.annotation.VisibleForTesting
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent.Source
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.home.toolbar.DisplayActions.MenuClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterLongClicked

/**
 * [Middleware] responsible for recording telemetry of actions triggered by compose toolbars.
 */
class BrowserToolbarTelemetryMiddleware : Middleware<BrowserToolbarState, BrowserToolbarAction> {
    override fun invoke(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        next: (BrowserToolbarAction) -> Unit,
        action: BrowserToolbarAction,
    ) {
        when (action) {
            is TabCounterClicked -> {
                trackToolbarEvent(ToolbarActionRecord.TabCounterClicked, action.source)
            }
            is TabCounterLongClicked -> {
                trackToolbarEvent(ToolbarActionRecord.TabCounterLongClicked, action.source)
            }
            is AddNewTab -> {
                trackToolbarEvent(ToolbarActionRecord.AddNewTab, action.source)
            }
            is AddNewPrivateTab -> {
                trackToolbarEvent(ToolbarActionRecord.AddNewPrivateTab, action.source)
            }
            is MenuClicked -> {
                trackToolbarEvent(ToolbarActionRecord.MenuClicked, action.source)
            }
            else -> {}
        }
        next(action)
    }

    @VisibleForTesting
    internal sealed class ToolbarActionRecord(val action: String) {
        data object MenuClicked : ToolbarActionRecord("menu_press")
        data object TabCounterClicked : ToolbarActionRecord("tabs_tray")
        data object TabCounterLongClicked : ToolbarActionRecord("tabs_tray_long_press")
        data object AddNewTab : ToolbarActionRecord("add_new_tab")
        data object AddNewPrivateTab : ToolbarActionRecord("add_new_private_tab")
    }

    private fun trackToolbarEvent(
        toolbarActionRecord: ToolbarActionRecord,
        source: Source = Source.AddressBar,
    ) {
        when (source) {
            Source.AddressBar ->
                Events.browserToolbarAction.record(
                    Events.BrowserToolbarActionExtra(
                        item = toolbarActionRecord.action,
                    ),
                )

            Source.NavigationBar ->
                Events.browserNavbarAction.record(
                    Events.BrowserNavbarActionExtra(
                        item = toolbarActionRecord.action,
                    ),
                )
        }
    }
}
