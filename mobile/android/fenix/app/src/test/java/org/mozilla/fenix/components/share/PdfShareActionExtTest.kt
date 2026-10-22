/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import io.mockk.every
import io.mockk.mockk
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ShareResourceAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.EngineState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.fetch.Headers.Names.CONTENT_TYPE
import mozilla.components.concept.fetch.MutableHeaders
import mozilla.components.concept.fetch.Response
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.utils.INTENT_TYPE_PDF
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PdfShareActionExtTest {

    private val captureActionsMiddleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()

    private fun storeOf(vararg tabs: TabSessionState) =
        BrowserStore(
            initialState = BrowserState(tabs = tabs.toList(), selectedTabId = tabs.firstOrNull()?.id),
            middleware = listOf(captureActionsMiddleware),
        )

    private fun pdfTab(url: String, engineSession: EngineSession? = null) =
        createTab(url = url, id = "1", private = true).let {
            it.copy(
                content = it.content.copy(isPdf = true),
                engineState = EngineState(engineSession = engineSession),
            )
        }

    private fun responseFor(url: String) =
        Response(
            url = url,
            status = 200,
            headers = MutableHeaders(CONTENT_TYPE to "application/pdf"),
            body = Response.Body.empty(),
        )

    private fun engineSessionResolving(response: Response) =
        mockk<EngineSession> {
            every { requestPdfToShare(any(), any()) } answers { firstArg<(Response) -> Unit>().invoke(response) }
        }

    private fun engineSessionFailing(throwable: Throwable) =
        mockk<EngineSession> {
            every { requestPdfToShare(any(), any()) } answers { secondArg<(Throwable) -> Unit>().invoke(throwable) }
        }

    @Test
    fun `GIVEN there is nothing to share as a PDF WHEN tryDispatchPdfShareAction is called THEN return false and dispatch nothing`() {
        val nonPdfTab = createTab(url = "https://mozilla.org", id = "1")
        val store = storeOf(nonPdfTab)

        assertFalse(store.tryDispatchPdfShareAction(tabId = null, url = null))
        assertFalse(store.tryDispatchPdfShareAction(tabId = "unknown", url = "https://mozilla.org/doc.pdf"))
        assertFalse(store.tryDispatchPdfShareAction(tabId = nonPdfTab.id, url = nonPdfTab.content.url))
        captureActionsMiddleware.assertNotDispatched(ShareResourceAction.AddShareAction::class)
    }

    @Test
    fun `GIVEN a PDF tab with an engine session WHEN tryDispatchPdfShareAction is called THEN dispatch AddShareAction with DirectResource`() {
        val url = "https://mozilla.org/document.pdf"
        val response = responseFor(url)
        val tab = pdfTab(url, engineSessionResolving(response))
        val store = storeOf(tab)

        assertTrue(store.tryDispatchPdfShareAction(tabId = tab.id, url = url))
        captureActionsMiddleware.assertFirstAction(ShareResourceAction.AddShareAction::class) {
            assertEquals(
                ShareResourceAction.AddShareAction(
                    tab.id,
                    ShareResourceState.DirectResource(url = url, contentType = INTENT_TYPE_PDF, response = response),
                ),
                it,
            )
        }
    }

    @Test
    fun `GIVEN a content PDF without an engine session WHEN tryDispatchPdfShareAction is called THEN fall back to LocalResource`() {
        val url = "content://pdf.pdf"
        val tab = pdfTab(url)
        val store = storeOf(tab)

        assertTrue(store.tryDispatchPdfShareAction(tabId = tab.id, url = url))
        captureActionsMiddleware.assertFirstAction(ShareResourceAction.AddShareAction::class) {
            assertEquals(
                ShareResourceAction.AddShareAction(
                    tab.id,
                    ShareResourceState.LocalResource(url, contentType = INTENT_TYPE_PDF),
                ),
                it,
            )
        }
    }

    @Test
    fun `GIVEN a remote PDF without an engine session WHEN tryDispatchPdfShareAction is called THEN fall back to InternetResource`() {
        val url = "https://mozilla.org/document.pdf"
        val tab = pdfTab(url)
        val store = storeOf(tab)

        assertTrue(store.tryDispatchPdfShareAction(tabId = tab.id, url = url))
        captureActionsMiddleware.assertFirstAction(ShareResourceAction.AddShareAction::class) {
            assertEquals(
                ShareResourceAction.AddShareAction(
                    tab.id,
                    ShareResourceState.InternetResource(
                        url = url,
                        contentType = INTENT_TYPE_PDF,
                        private = true,
                        referrerUrl = url,
                    ),
                ),
                it,
            )
        }
    }

    @Test
    fun `GIVEN requestPdfToShare fails WHEN tryDispatchPdfShareAction is called THEN fall back to InternetResource`() {
        val url = "https://mozilla.org/document.pdf"
        val tab = pdfTab(url, engineSessionFailing(IllegalStateException("boom")))
        val store = storeOf(tab)

        assertTrue(store.tryDispatchPdfShareAction(tabId = tab.id, url = url))
        captureActionsMiddleware.assertFirstAction(ShareResourceAction.AddShareAction::class) {
            assertEquals(
                ShareResourceAction.AddShareAction(
                    tab.id,
                    ShareResourceState.InternetResource(
                        url = url,
                        contentType = INTENT_TYPE_PDF,
                        private = true,
                        referrerUrl = url,
                    ),
                ),
                it,
            )
        }
    }
}
