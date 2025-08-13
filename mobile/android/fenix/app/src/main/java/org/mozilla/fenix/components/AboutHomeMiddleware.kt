/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] implementation for overriding the title of the "about:home" homepage tab with the
 * provided [homepageTitle].
 *
 * @param homepageTitle The title of the homepage tab.
 */
class AboutHomeMiddleware(
    private val homepageTitle: String,
) : Middleware<BrowserState, BrowserAction> {
    override fun invoke(
        context: MiddlewareContext<BrowserState, BrowserAction>,
        next: (BrowserAction) -> Unit,
        action: BrowserAction,
    ) {
        if (action is ContentAction.UpdateTitleAction &&
            context.state.findTab(tabId = action.sessionId)?.content?.url == ABOUT_HOME_URL
        ) {
            // Override the title of the homepage tab with the provided [homepageTitle].
            next(
                ContentAction.UpdateTitleAction(
                    sessionId = action.sessionId,
                    title = homepageTitle,
                ),
            )
        } else {
            next(action)
        }
    }
}
