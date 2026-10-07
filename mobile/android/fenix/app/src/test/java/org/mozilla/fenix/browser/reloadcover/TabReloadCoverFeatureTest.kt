/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import android.graphics.Bitmap
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.EngineState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.storage.ThumbnailStorage
import mozilla.components.concept.engine.EngineSessionState
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowToast

/**
 * Integration tests for [TabReloadCoverFeature]. These exercise the view-level wiring — [store] events flowing through
 * the Feature's imperative show/hide logic into [CoverPresenter] and the [ImageView], plus the side-channel dispatches
 * into [BrowserScreenStore] that drive the toolbar's "Cached" chip and the "Live page" toast.
 */
@RunWith(RobolectricTestRunner::class)
class TabReloadCoverFeatureTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var store: BrowserStore
    private lateinit var thumbnailStorage: ThumbnailStorage
    private lateinit var telemetry: TabReloadCoverTelemetry
    private lateinit var coverView: ImageView
    private lateinit var feature: TabReloadCoverFeature

    @Before
    fun setUp() {
        // A tab with a persisted engine state but no linked engine session — i.e., restore pending.
        val restorePendingTab =
            createTab(url = "https://www.mozilla.org", id = "1")
                .copy(engineState = EngineState(engineSessionState = mockk<EngineSessionState>()))
        store = BrowserStore(BrowserState(tabs = listOf(restorePendingTab), selectedTabId = "1"))
        thumbnailStorage = mockk {
            every { loadThumbnail(any()) } returns
                CompletableDeferred(Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888))
        }
        telemetry = mockk(relaxed = true)

        // Mirrors fragment_browser.xml: the cover is a sibling of swipeRefresh (whose translationY the
        // presenter mirrors) and starts hidden — the layout sets `android:visibility="gone"` on the
        // ImageView. Reproducing that here lets tests where the feature deliberately doesn't touch
        // the view (e.g. non-restore-pending tabs) assert against GONE without a false positive.
        coverView = ImageView(testContext).apply { visibility = View.GONE }
        FrameLayout(testContext).apply {
            addView(View(testContext).apply { id = R.id.swipeRefresh })
            addView(coverView)
        }

        feature =
            TabReloadCoverFeature(
                store = store,
                browserScreenStore = BrowserScreenStore(),
                thumbnailStorage = thumbnailStorage,
                coverView = coverView,
                tabId = null,
                isOnline = { true },
                telemetry = telemetry,
                dispatcher = testDispatcher,
            )
    }

    @After
    fun tearDown() {
        feature.stop()
        ShadowToast.reset()
    }

    @Test
    fun `when fully visible, cover image is dismissed on touch, rather than left static as the live page scrolls behind it`() =
        runTest(testDispatcher) {
            feature.start()
            // runCurrent rather than advanceUntilIdle: the latter burns through the full safety timeout and hides
            // the cover before the assertions run.
            testDispatcher.scheduler.runCurrent()

            assertEquals(View.VISIBLE, coverView.visibility)

            val down = MotionEvent.obtain(0L, 0L, MotionEvent.ACTION_DOWN, 10f, 10f, 0)
            try {
                val consumed = coverView.dispatchTouchEvent(down)

                assertEquals(View.GONE, coverView.visibility)
                assertFalse(consumed)
                verify(exactly = 1) { telemetry.onExit(HideReason.DISMISSED) }
            } finally {
                down.recycle()
            }
        }

    @Test
    fun `fresh navigation on an already-linked tab does not show the cover`() =
        runTest(testDispatcher) {
            val alreadyLinkedTab =
                createTab(url = "https://www.mozilla.org", id = "2")
                    .copy(engineState = EngineState(engineSession = mockk(relaxed = true)))
            store = BrowserStore(BrowserState(tabs = listOf(alreadyLinkedTab), selectedTabId = "2"))
            feature =
                TabReloadCoverFeature(
                    store = store,
                    browserScreenStore = BrowserScreenStore(),
                    thumbnailStorage = thumbnailStorage,
                    coverView = coverView,
                    tabId = null,
                    isOnline = { true },
                    telemetry = telemetry,
                    dispatcher = testDispatcher,
                )

            feature.start()
            testDispatcher.scheduler.runCurrent()

            assertEquals(View.GONE, coverView.visibility)
        }

    @Test
    fun `restore-pending tab with stale fcp=true still shows the cover`() =
        runTest(testDispatcher) {
            // Content-process-crash scenario: firstContentfulPaint persists across the crash. The Feature must not
            // treat the stale fcp=true as a fresh paint and skip the cover.
            val restoreWithStaleFcp =
                createTab(url = "https://www.mozilla.org", id = "3")
                    .copy(engineState = EngineState(engineSessionState = mockk<EngineSessionState>()))
                    .let { it.copy(content = it.content.copy(firstContentfulPaint = true)) }
            store = BrowserStore(BrowserState(tabs = listOf(restoreWithStaleFcp), selectedTabId = "3"))
            feature =
                TabReloadCoverFeature(
                    store = store,
                    browserScreenStore = BrowserScreenStore(),
                    thumbnailStorage = thumbnailStorage,
                    coverView = coverView,
                    tabId = null,
                    isOnline = { true },
                    telemetry = telemetry,
                    dispatcher = testDispatcher,
                )

            feature.start()
            testDispatcher.scheduler.runCurrent()

            assertEquals(View.VISIBLE, coverView.visibility)
        }

    @Test
    fun `during the post-FCP hold, the cover is still dismissable by touch and dismissal does not fire the Live page toast`() =
        runTest(testDispatcher) {
            feature.start()
            testDispatcher.scheduler.runCurrent()
            assertEquals(View.VISIBLE, coverView.visibility)

            // FCP schedules a 400ms hold before the natural finalize. During that window the cover stays fully
            // visible and must remain dismissable. A user-dismiss during the hold must not fire the toast (the
            // toast is only meaningful when the timer's natural finalize actually reveals a live page).
            store.dispatch(ContentAction.UpdateFirstContentfulPaintStateAction("1", true))
            testDispatcher.scheduler.runCurrent()
            assertEquals(View.VISIBLE, coverView.visibility)

            val down = MotionEvent.obtain(0L, 0L, MotionEvent.ACTION_DOWN, 10f, 10f, 0)
            try {
                coverView.dispatchTouchEvent(down)

                assertEquals(View.GONE, coverView.visibility)
                assertNull(ShadowToast.getLatestToast())
            } finally {
                down.recycle()
            }
        }

    @Test
    fun `after stop, the cover is not touchable and touching it does not crash`() =
        runTest(testDispatcher) {
            feature.start()
            testDispatcher.scheduler.runCurrent()
            assertEquals(View.VISIBLE, coverView.visibility)

            feature.stop()
            assertEquals(View.GONE, coverView.visibility)

            val down = MotionEvent.obtain(0L, 0L, MotionEvent.ACTION_DOWN, 10f, 10f, 0)
            try {
                coverView.dispatchTouchEvent(down)

                assertEquals(View.GONE, coverView.visibility)
            } finally {
                down.recycle()
            }
        }
}
