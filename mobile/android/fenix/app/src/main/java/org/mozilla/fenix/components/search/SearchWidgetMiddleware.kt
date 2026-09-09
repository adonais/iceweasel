/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.search

import android.content.Context
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.SearchAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.gecko.search.SearchWidgetProvider

/**
 * [Middleware] that refreshes the search widget whenever the default search engine changes.
 *
 * The widget's Google Lens button is only shown when Google is the default engine, so the widget must be redrawn after
 * the user selects a different default. Driving this from the reducer action keeps the side effect out of the UI and
 * covers every code path that changes the default engine.
 *
 * @param context the application context.
 * @param updateWidget invoked to refresh all widget instances; injectable for testing.
 */
class SearchWidgetMiddleware(
    private val context: Context,
    private val updateWidget: (Context) -> Unit = { SearchWidgetProvider.updateAllWidgets(it) },
) : Middleware<BrowserState, BrowserAction> {
    override fun invoke(
        store: Store<BrowserState, BrowserAction>,
        next: (BrowserAction) -> Unit,
        action: BrowserAction,
    ) {
        next(action)

        if (action is SearchAction.SelectSearchEngineAction) {
            updateWidget(context)
        }
    }
}
