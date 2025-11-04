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
import org.mozilla.fenix.GleanMetrics.Toolbar
import org.mozilla.fenix.home.toolbar.DisplayActions.MenuClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterLongClicked
import org.mozilla.fenix.telemetry.ACTION_ADD_NEW_PRIVATE_TAB
import org.mozilla.fenix.telemetry.ACTION_ADD_NEW_TAB
import org.mozilla.fenix.telemetry.ACTION_MENU_CLICKED
import org.mozilla.fenix.telemetry.ACTION_TAB_COUNTER_CLICKED
import org.mozilla.fenix.telemetry.ACTION_TAB_COUNTER_LONG_CLICKED
import org.mozilla.fenix.telemetry.SOURCE_ADDRESS_BAR
import org.mozilla.fenix.telemetry.SOURCE_NAVIGATION_BAR

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
        data object MenuClicked : ToolbarActionRecord(ACTION_MENU_CLICKED)
        data object TabCounterClicked : ToolbarActionRecord(ACTION_TAB_COUNTER_CLICKED)
        data object TabCounterLongClicked : ToolbarActionRecord(ACTION_TAB_COUNTER_LONG_CLICKED)
        data object AddNewTab : ToolbarActionRecord(ACTION_ADD_NEW_TAB)
        data object AddNewPrivateTab : ToolbarActionRecord(ACTION_ADD_NEW_PRIVATE_TAB)
    }

    private fun trackToolbarEvent(
        toolbarActionRecord: ToolbarActionRecord,
        source: Source = Source.AddressBar,
    ) {
        when (source) {
            Source.AddressBar ->
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(
                        source = SOURCE_ADDRESS_BAR,
                        item = toolbarActionRecord.action,
                    ),
                )

            Source.NavigationBar ->
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(
                        source = SOURCE_NAVIGATION_BAR,
                        item = toolbarActionRecord.action,
                    ),
                )
        }
    }
}
