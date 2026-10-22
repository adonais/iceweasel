/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import mozilla.components.browser.state.action.ShareResourceAction
import mozilla.components.browser.state.selector.findTabOrCustomTabOrSelectedTab
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.ktx.kotlin.isContentUrl
import mozilla.components.support.utils.INTENT_TYPE_PDF

private val logger = Logger("PdfShareActionExt")

/**
 * Dispatches a [ShareResourceAction.AddShareAction] needed to share the PDF shown in the tab with the given [tabId], if
 * that tab is showing a PDF.
 *
 * @param tabId ID of the tab session, or null if the selected session should be used.
 * @param url The url of the PDF to share.
 * @return True if the tab is showing a PDF and a share was dispatched or scheduled, false if it couldn't be dispatched.
 */
internal fun BrowserStore.tryDispatchPdfShareAction(
    tabId: String?,
    url: String?,
): Boolean {
    val session = state.findTabOrCustomTabOrSelectedTab(tabId)

    if (url == null || session == null || !session.content.isPdf) return false

    val engineSession = session.engineState.engineSession
    if (engineSession == null) {
        dispatchPdfShareFallbackAction(session, url)
        return true
    }

    engineSession.requestPdfToShare(
        onResult = { response ->
            dispatch(
                ShareResourceAction.AddShareAction(
                    session.id,
                    ShareResourceState.DirectResource(
                        url = url,
                        contentType = INTENT_TYPE_PDF,
                        response = response,
                    ),
                )
            )
        },
        onException = { throwable ->
            logger.error("Unable to fetch PDF bytes directly, falling back", throwable)
            dispatchPdfShareFallbackAction(session, url)
        },
    )
    return true
}

private fun BrowserStore.dispatchPdfShareFallbackAction(session: SessionState, url: String) {
    val resource =
        if (url.isContentUrl()) {
            ShareResourceState.LocalResource(url, contentType = INTENT_TYPE_PDF)
        } else {
            ShareResourceState.InternetResource(
                url = url,
                contentType = INTENT_TYPE_PDF,
                private = session.content.private,
                referrerUrl = session.content.url,
            )
        }
    dispatch(ShareResourceAction.AddShareAction(session.id, resource))
}
