/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlinx.coroutines.Job
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.facts.BrowserThumbnailsFacts
import mozilla.components.browser.thumbnails.storage.ThumbnailStorage
import mozilla.components.concept.base.images.ImageSaveRequest
import mozilla.components.support.base.facts.processor.CollectionProcessor
import mozilla.components.support.test.any
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.mock
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

@RunWith(AndroidJUnit4::class)
class ThumbnailsMiddlewareTest {

    @Test
    fun `thumbnail storage stores the provided thumbnail on update thumbnail action`() {
        val request = ImageSaveRequest("test-tab1", false)
        val tab = createTab("https://www.mozilla.org", id = "test-tab1")
        val thumbnailStorage: ThumbnailStorage = mock()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(Job())
        val store =
            BrowserStore(
                initialState = BrowserState(tabs = listOf(tab)),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        val bitmap: Bitmap = mock()
        store.dispatch(ContentAction.UpdateThumbnailAction(request.id, bitmap))
        verify(thumbnailStorage).saveThumbnail(request, bitmap)
    }

    @Test
    fun `WHEN update thumbnail action called with private tab THEN storage stores provided thumbnail`() {
        val request = ImageSaveRequest("test-tab1", true)
        val tab = createTab("https://www.mozilla.org", id = "test-tab1", private = true)
        val thumbnailStorage: ThumbnailStorage = mock()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(Job())
        val store =
            BrowserStore(
                initialState = BrowserState(tabs = listOf(tab)),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        val bitmap: Bitmap = mock()
        store.dispatch(ContentAction.UpdateThumbnailAction(request.id, bitmap))
        verify(thumbnailStorage).saveThumbnail(request, bitmap)
    }

    @Test
    fun `thumbnail storage removes the thumbnail on remove all normal tabs action`() {
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                                createTab("https://www.wikipedia.com", id = "test-tab3"),
                                createTab("https://www.example.org", private = true, id = "test-tab4"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveAllNormalTabsAction)
        verify(thumbnailStorage).deleteThumbnail("test-tab1", false)
        verify(thumbnailStorage).deleteThumbnail("test-tab2", false)
        verify(thumbnailStorage).deleteThumbnail("test-tab3", false)
        verify(thumbnailStorage, never()).deleteThumbnail("test-tab4", true)
    }

    @Test
    fun `thumbnail storage removes the thumbnail on remove all private tabs action`() {
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", private = true, id = "test-tab2"),
                                createTab("https://www.wikipedia.com", private = true, id = "test-tab3"),
                                createTab("https://www.example.org", private = true, id = "test-tab4"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveAllPrivateTabsAction)
        verify(thumbnailStorage, never()).deleteThumbnail("test-tab1", false)
        verify(thumbnailStorage).deleteThumbnail("test-tab2", true)
        verify(thumbnailStorage).deleteThumbnail("test-tab3", true)
        verify(thumbnailStorage).deleteThumbnail("test-tab4", true)
    }

    @Test
    fun `thumbnail storage removes the thumbnail on remove all tabs action`() {
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveAllTabsAction())
        verify(thumbnailStorage).clearThumbnails()
    }

    @Test
    fun `thumbnail storage removes the thumbnail on remove tab action`() {
        val sessionIdOrUrl = "test-tab1"
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveTabAction(sessionIdOrUrl))
        verify(thumbnailStorage).deleteThumbnail(sessionIdOrUrl, false)
    }

    @Test
    fun `WHEN remove tab action with private tab THEN thumbnail storage removes the thumbnail`() {
        val sessionIdOrUrl = "test-tab1"
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1", private = true),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveTabAction(sessionIdOrUrl))
        verify(thumbnailStorage).deleteThumbnail(sessionIdOrUrl, true)
    }

    @Test
    fun `thumbnail storage removes the thumbnail on remove tabs action`() {
        val sessionIdOrUrl = "test-tab1"
        val thumbnailStorage: ThumbnailStorage = mock()
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                            )
                    ),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        store.dispatch(TabListAction.RemoveTabsAction(listOf(sessionIdOrUrl)))
        verify(thumbnailStorage).deleteThumbnail(sessionIdOrUrl, false)
    }

    @Test
    fun `WHEN saveThumbnail job completes THEN a disk_write_duration fact is emitted`() {
        val request = ImageSaveRequest("test-tab1", false)
        val tab = createTab("https://www.mozilla.org", id = "test-tab1")
        val thumbnailStorage: ThumbnailStorage = mock()
        val saveJob = Job()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(saveJob)
        val store =
            BrowserStore(
                initialState = BrowserState(tabs = listOf(tab)),
                middleware = listOf(ThumbnailsMiddleware(thumbnailStorage)),
            )

        CollectionProcessor.withFactCollection { facts ->
            store.dispatch(ContentAction.UpdateThumbnailAction(request.id, mock()))

            // Save is in-flight; no duration fact yet.
            assertTrue(facts.none { it.item == BrowserThumbnailsFacts.Items.DISK_WRITE_DURATION })

            saveJob.complete()

            val fact = facts.single { it.item == BrowserThumbnailsFacts.Items.DISK_WRITE_DURATION }
            val durationMs = fact.metadata?.get(BrowserThumbnailsFacts.MetadataKeys.DURATION_MS)
            assertNotNull(durationMs)
            assertIs<Long>(durationMs)
            assertTrue((durationMs) >= 0)
        }
    }

    @Test
    fun `thumbnail actions are the only ones consumed by the middleware`() {
        val capture = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val thumbnailStorage: ThumbnailStorage = mock()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(Job())
        val store =
            BrowserStore(
                initialState =
                    BrowserState(
                        tabs =
                            listOf(
                                createTab("https://www.mozilla.org", id = "test-tab1"),
                                createTab("https://www.firefox.com", id = "test-tab2"),
                            )
                    ),
                middleware =
                    listOf(
                        ThumbnailsMiddleware(thumbnailStorage),
                        capture,
                    ),
            )

        store.dispatch(ContentAction.UpdateThumbnailAction("test-tab1", mock()))
        store.dispatch(TabListAction.RemoveTabAction("test-tab1"))

        // We shouldn't allow thumbnail actions to continue being processed.
        capture.assertNotDispatched(ContentAction.UpdateThumbnailAction::class)
        // TabListActions that we also observe in the middleware _should_ continue being processed.
        capture.assertLastAction(TabListAction.RemoveTabAction::class) {}

        // All other actions should also continue being processed.
        store.dispatch(EngineAction.KillEngineSessionAction("test-tab1"))
        capture.assertLastAction(EngineAction.KillEngineSessionAction::class) {}
    }
}
