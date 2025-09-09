/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import androidx.annotation.VisibleForTesting
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent.Source
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import org.mozilla.fenix.GleanMetrics.Events
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

/**
 * [Middleware] responsible for recording telemetry of actions triggered by compose toolbars.
 */
class BrowserToolbarTelemetryMiddleware : Middleware<BrowserToolbarState, BrowserToolbarAction> {
    @Suppress("CyclomaticComplexMethod")
    override fun invoke(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        next: (BrowserToolbarAction) -> Unit,
        action: BrowserToolbarAction,
    ) {
        when (action) {
            is MenuClicked -> {
                trackToolbarEvent(ToolbarActionRecord.MenuClicked, action.source)
            }
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
            is NavigateBackClicked -> {
                trackToolbarEvent(ToolbarActionRecord.NavigateBackClicked, action.source)
            }
            is NavigateBackLongClicked -> {
                trackToolbarEvent(ToolbarActionRecord.NavigateBackLongClicked, action.source)
            }
            is NavigateForwardClicked -> {
                trackToolbarEvent(ToolbarActionRecord.NavigateForwardClicked, action.source)
            }
            is NavigateForwardLongClicked -> {
                trackToolbarEvent(ToolbarActionRecord.NavigateForwardLongClicked, action.source)
            }
            is RefreshClicked -> {
                trackToolbarEvent(ToolbarActionRecord.RefreshClicked, action.source)
            }
            is StopRefreshClicked -> {
                trackToolbarEvent(ToolbarActionRecord.StopRefreshClicked, action.source)
            }
            is AddBookmarkClicked -> {
                trackToolbarEvent(ToolbarActionRecord.AddBookmarkClicked, action.source)
            }
            is EditBookmarkClicked -> {
                trackToolbarEvent(ToolbarActionRecord.EditBookmarkClicked, action.source)
            }
            is ShareClicked -> {
                trackToolbarEvent(ToolbarActionRecord.ShareClicked, action.source)
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
        data object NavigateBackClicked : ToolbarActionRecord("back")
        data object NavigateBackLongClicked : ToolbarActionRecord("back_long_press")
        data object NavigateForwardClicked : ToolbarActionRecord("forward")
        data object NavigateForwardLongClicked : ToolbarActionRecord("forward_long_press")
        data object RefreshClicked : ToolbarActionRecord("refresh")
        data object StopRefreshClicked : ToolbarActionRecord("stop_refresh")
        data object AddBookmarkClicked : ToolbarActionRecord("add_bookmark")
        data object EditBookmarkClicked : ToolbarActionRecord("edit_bookmark")
        data object ShareClicked : ToolbarActionRecord("share")
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
