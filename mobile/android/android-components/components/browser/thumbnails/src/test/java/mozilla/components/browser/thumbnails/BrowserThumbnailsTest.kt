/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.StandardTestDispatcher
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.facts.BrowserThumbnailsFacts
import mozilla.components.browser.thumbnails.storage.ThumbnailStorage
import mozilla.components.concept.engine.EngineView
import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.processor.CollectionProcessor
import mozilla.components.support.test.any
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoMoreInteractions
import org.mockito.Mockito.`when`

private const val ANY_TRIGGER = BrowserThumbnailsFacts.CaptureAttemptedTriggers.EXTERNAL_REQUEST

@RunWith(AndroidJUnit4::class)
class BrowserThumbnailsTest {

    private lateinit var store: BrowserStore
    private lateinit var engineView: EngineView
    private lateinit var thumbnails: BrowserThumbnails
    private val tabId = "test-tab"
    private val tab = createTab("https://www.mozilla.org", id = tabId)

    private val testDispatcher = StandardTestDispatcher()
    private val captureActionsMiddleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()

    @Before
    fun setup() {
        val thumbnailStorage: ThumbnailStorage = mock()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(Job())
        store =
            BrowserStore(
                BrowserState(
                    tabs = listOf(tab),
                    selectedTabId = tabId,
                ),
                middleware =
                    listOf(
                        captureActionsMiddleware,
                        ThumbnailsMiddleware(thumbnailStorage),
                    ),
            )
        engineView = mock()
        thumbnails = BrowserThumbnails(testContext, engineView, store, testDispatcher)
    }

    @Test
    fun `do not capture thumbnail when feature is stopped and a site finishes loading`() {
        thumbnails.start()
        testDispatcher.scheduler.advanceUntilIdle()
        thumbnails.stop()

        store.dispatch(ContentAction.UpdateThumbnailAction(tabId, mock()))

        verifyNoMoreInteractions(engineView)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `feature must capture thumbnail when a site finishes loading and first paint`() {
        val bitmap: Bitmap = mock()

        store.dispatch(ContentAction.UpdateLoadingStateAction(tabId, true))

        thumbnails.start()
        testDispatcher.scheduler.advanceUntilIdle()

        `when`(engineView.captureThumbnail(any())).thenAnswer {
            // if engineView responds with a bitmap
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(bitmap)
        }

        captureActionsMiddleware.assertNotDispatched(ContentAction.UpdateThumbnailAction::class)

        store.dispatch(ContentAction.UpdateLoadingStateAction(tabId, false))
        store.dispatch(ContentAction.UpdateFirstContentfulPaintStateAction(tabId, true))
        testDispatcher.scheduler.advanceUntilIdle()

        captureActionsMiddleware.assertFirstAction(ContentAction.UpdateThumbnailAction::class) { action ->
            assertEquals(tabId, action.sessionId)
            assertEquals(bitmap, action.thumbnail)
        }
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `feature never updates the store if there is no thumbnail bitmap`() {
        val store = BrowserStore(mock(), middleware = listOf(captureActionsMiddleware))

        // clear InitAction
        captureActionsMiddleware.reset()

        val engineView: EngineView = mock()
        val feature = BrowserThumbnails(testContext, engineView, store)

        `when`(engineView.captureThumbnail(any())).thenAnswer {
            // if engineView responds with a bitmap
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(null)
        }

        feature.requestScreenshot(ANY_TRIGGER)

        captureActionsMiddleware.assertNoActionDispatched()
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `feature never updates the store if there is no tab ID`() {
        val thumbnailStorage: ThumbnailStorage = mock()
        `when`(thumbnailStorage.saveThumbnail(any(), any())).thenReturn(Job())
        val store =
            BrowserStore(
                BrowserState(
                    tabs = listOf(tab),
                    selectedTabId = tabId,
                ),
                middleware =
                    listOf(
                        captureActionsMiddleware,
                        ThumbnailsMiddleware(thumbnailStorage),
                    ),
            )

        val engineView: EngineView = mock()
        val feature = BrowserThumbnails(testContext, engineView, store)
        val bitmap: Bitmap = mock()

        `when`(engineView.captureThumbnail(any())).thenAnswer {
            // if engineView responds with a bitmap
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(bitmap)
        }

        feature.requestScreenshot(ANY_TRIGGER)

        captureActionsMiddleware.assertFirstAction(ContentAction.UpdateThumbnailAction::class) { action ->
            assertEquals(tabId, action.sessionId)
            assertEquals(bitmap, action.thumbnail)
        }
    }

    @Test
    fun `when a page is loaded and the os is in low memory condition thumbnail should not be captured`() {
        store.dispatch(ContentAction.UpdateThumbnailAction(tabId, mock()))

        thumbnails.testLowMemory = true

        thumbnails.start()
        testDispatcher.scheduler.advanceUntilIdle()

        verify(engineView, never()).captureThumbnail(any())
    }

    @Test
    fun `requestScreenshot emits a capture_attempted fact with the supplied trigger`() {
        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(trigger = BrowserThumbnailsFacts.CaptureAttemptedTriggers.TAB_COUNTER_CLICK)

            assertEquals(1, facts.size)
            with(facts.single()) {
                assertEquals(Component.BROWSER_THUMBNAILS, component)
                assertEquals(Action.IMPLEMENTATION_DETAIL, action)
                assertEquals(BrowserThumbnailsFacts.Items.CAPTURE_ATTEMPTED, item)
                assertEquals(
                    BrowserThumbnailsFacts.CaptureAttemptedTriggers.TAB_COUNTER_CLICK,
                    value,
                )
            }
        }
    }

    @Test
    fun `store-flow load transition triggers a capture_attempted fact with LOAD_COMPLETED`() {
        CollectionProcessor.withFactCollection { facts ->
            store.dispatch(ContentAction.UpdateLoadingStateAction(tabId, true))

            thumbnails.start()
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(0, facts.size)

            store.dispatch(ContentAction.UpdateLoadingStateAction(tabId, false))
            store.dispatch(ContentAction.UpdateFirstContentfulPaintStateAction(tabId, true))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(1, facts.size)
            assertEquals(
                BrowserThumbnailsFacts.CaptureAttemptedTriggers.LOAD_COMPLETED,
                facts.single().value,
            )
        }
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `requestScreenshot emits a capture_result fact with SUCCEEDED when the engine returns a bitmap`() {
        val bitmap: Bitmap = mock()
        `when`(engineView.captureThumbnail(any())).thenAnswer {
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(bitmap)
        }

        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(ANY_TRIGGER)

            val resultFact = facts.single { it.item == BrowserThumbnailsFacts.Items.CAPTURE_RESULT }
            assertEquals(BrowserThumbnailsFacts.CaptureResults.SUCCEEDED, resultFact.value)
        }
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `requestScreenshot emits a capture_result fact with NULL_BITMAP when the engine returns null`() {
        `when`(engineView.captureThumbnail(any())).thenAnswer {
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(null)
        }

        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(ANY_TRIGGER)

            val resultFact = facts.single { it.item == BrowserThumbnailsFacts.Items.CAPTURE_RESULT }
            assertEquals(BrowserThumbnailsFacts.CaptureResults.NULL_BITMAP, resultFact.value)
        }
    }

    @Test
    fun `requestScreenshot emits a capture_result fact with LOW_MEMORY when the memory gate skips it`() {
        thumbnails.testLowMemory = true

        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(ANY_TRIGGER)

            val resultFact = facts.single { it.item == BrowserThumbnailsFacts.Items.CAPTURE_RESULT }
            assertEquals(BrowserThumbnailsFacts.CaptureResults.LOW_MEMORY, resultFact.value)
            verify(engineView, never()).captureThumbnail(any())
        }
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `requestScreenshot emits a capture_duration fact when the engine callback fires`() {
        `when`(engineView.captureThumbnail(any())).thenAnswer {
            (it.arguments[0] as (Bitmap?) -> Unit).invoke(mock())
        }

        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(ANY_TRIGGER)

            val durationFact = facts.single { it.item == BrowserThumbnailsFacts.Items.CAPTURE_DURATION }
            val durationMs = durationFact.metadata?.get(BrowserThumbnailsFacts.MetadataKeys.DURATION_MS)
            assertNotNull(durationMs)
            assertIs<Long>(durationMs)
            assertTrue(durationMs >= 0)
        }
    }

    @Test
    fun `requestScreenshot does not emit a capture_duration fact when the memory gate skips the request`() {
        thumbnails.testLowMemory = true

        CollectionProcessor.withFactCollection { facts ->
            thumbnails.requestScreenshot(ANY_TRIGGER)

            assertTrue(facts.none { it.item == BrowserThumbnailsFacts.Items.CAPTURE_DURATION })
        }
    }
}
