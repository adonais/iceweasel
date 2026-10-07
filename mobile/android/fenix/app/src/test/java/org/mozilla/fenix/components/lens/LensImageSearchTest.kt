/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.net.Uri
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import java.io.IOException
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.engine.EngineSession
import mozilla.components.support.test.robolectric.testContext
import mozilla.telemetry.glean.testing.GleanTestRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.GoogleLens
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.LensImageUploader
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LensImageSearchTest {
    @get:Rule val gleanTestRule = GleanTestRule(testContext)

    private val testDispatcher = StandardTestDispatcher()
    private val appStore = spyk(AppStore())
    private val uploader: LensImageUploader = mockk()
    private val browserUseCases: FenixBrowserUseCases = mockk(relaxed = true)
    private val imageUri: Uri = Uri.parse("content://test/image.jpg")
    private val resultUrl = "https://lens.google.com/results"

    private val lensImageSearch =
        LensImageSearch(
            appStore = appStore,
            uploader = { uploader },
            browserUseCases = { browserUseCases },
            scope = CoroutineScope(testDispatcher),
        )

    private fun setPrivateMode() {
        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()
    }

    private fun verifyResultOpened(private: Boolean, url: String = resultUrl) {
        verify {
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = url,
                newTab = true,
                private = private,
                flags = EngineSession.LoadUrlFlags.external(),
            )
        }
    }

    private fun verifyNoResultOpened() {
        verify(exactly = 0) {
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = any(),
                newTab = any(),
                private = any(),
                flags = any(),
            )
        }
    }

    @Test
    fun `GIVEN a successful upload WHEN searching with a camera image THEN the result is opened in a new tab`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { uploader.upload(imageUri, isPrivate = false) }
            verifyResultOpened(private = false)
        }

    @Test
    fun `GIVEN private browsing mode WHEN searching with a camera image THEN the upload and the tab are private`() =
        runTest(testDispatcher) {
            setPrivateMode()
            coEvery { uploader.upload(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { uploader.upload(imageUri, isPrivate = true) }
            verifyResultOpened(private = true)
        }

    @Test
    fun `GIVEN a successful upload WHEN searching with a camera image THEN LensResultAvailable is dispatched and LensDismissed is not`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            verify { appStore.dispatch(LensAction.LensResultAvailable(resultUrl)) }
            verify(exactly = 0) { appStore.dispatch(LensAction.LensDismissed) }
        }

    @Test
    fun `GIVEN a failed upload WHEN searching with a camera image THEN LensDismissed is dispatched and no tab is opened`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = null, httpStatusCode = 400)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { appStore.dispatch(any<LensAction.LensResultAvailable>()) }
            verifyNoResultOpened()
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("false", events.last().extra?.get("succeeded"))
            assertEquals("400", events.last().extra?.get("http_status_code"))
        }

    @Test
    fun `GIVEN an upload that throws IOException WHEN searching THEN a failure is recorded and LensDismissed is dispatched`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } throws IOException("boom")

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            verify { appStore.dispatch(LensAction.LensDismissed) }
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("false", events.last().extra?.get("succeeded"))
            assertNull(events.last().extra?.get("http_status_code"))
        }

    @Test
    fun `GIVEN an image whose permission was revoked WHEN searching THEN the SecurityException is handled and LensDismissed is dispatched`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } throws SecurityException("revoked")

            lensImageSearch.searchWithImage(imageUri, source = "photo_picker")
            testDispatcher.scheduler.advanceUntilIdle()

            verify { appStore.dispatch(LensAction.LensDismissed) }
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("false", events.last().extra?.get("succeeded"))
            assertEquals("photo_picker", events.last().extra?.get("source"))
        }

    @Test
    fun `GIVEN a camera image WHEN the upload succeeds THEN the searchCompleted event records the source and status code`() =
        runTest(testDispatcher) {
            coEvery { uploader.upload(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()

            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("true", events.last().extra?.get("succeeded"))
            assertEquals("200", events.last().extra?.get("http_status_code"))
            assertEquals("camera", events.last().extra?.get("source"))
        }

    @Test
    fun `GIVEN a successful upload WHEN searching from the image context menu THEN the result is opened and the source is context_menu`() =
        runTest(testDispatcher) {
            coEvery { uploader.uploadFromUrl(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImageUrl("https://example.com/image.jpg")
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { uploader.uploadFromUrl("https://example.com/image.jpg", isPrivate = false) }
            verifyResultOpened(private = false)
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("context_menu", events.last().extra?.get("source"))
        }

    @Test
    fun `GIVEN nothing observes the result WHEN searching from the image context menu THEN the lens state is cleared`() =
        runTest(testDispatcher) {
            coEvery { uploader.uploadFromUrl(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImageUrl("https://example.com/image.jpg")
            testDispatcher.scheduler.advanceUntilIdle()

            // Leaving a result behind would make the next toolbar Lens search consume a stale URL.
            verify { appStore.dispatch(LensAction.LensResultConsumed) }
            verify(exactly = 0) { appStore.dispatch(any<LensAction.LensResultAvailable>()) }
            assertNull(appStore.state.lensState.resultUrl)
        }

    @Test
    fun `GIVEN an upload is in flight WHEN a second search starts THEN only the second result is opened`() =
        runTest(testDispatcher) {
            val firstResultUrl = "https://lens.google.com/results?first"
            val pendingFirstUpload = CompletableDeferred<LensImageUploader.UploadResult>()
            coEvery { uploader.upload(any(), any()) } coAnswers { pendingFirstUpload.await() }
            coEvery { uploader.uploadFromUrl(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImage(imageUri, source = "camera")
            testDispatcher.scheduler.advanceUntilIdle()
            lensImageSearch.searchWithImageUrl("https://example.com/image.jpg")
            testDispatcher.scheduler.advanceUntilIdle()

            pendingFirstUpload.complete(
                LensImageUploader.UploadResult(resultUrl = firstResultUrl, httpStatusCode = 200)
            )
            testDispatcher.scheduler.advanceUntilIdle()

            verifyResultOpened(private = false)
            verify(exactly = 0) {
                browserUseCases.loadUrlOrSearch(
                    searchTermOrURL = firstResultUrl,
                    newTab = any(),
                    private = any(),
                    flags = any(),
                )
            }
            // The cancelled search records nothing, so the only event is the second one.
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals(1, events.size)
            assertEquals("context_menu", events.last().extra?.get("source"))
        }

    @Test
    fun `GIVEN private browsing mode WHEN searching from the image context menu THEN the tab is opened as private`() =
        runTest(testDispatcher) {
            setPrivateMode()
            coEvery { uploader.uploadFromUrl(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            lensImageSearch.searchWithImageUrl("https://example.com/image.jpg")
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { uploader.uploadFromUrl("https://example.com/image.jpg", isPrivate = true) }
            verifyResultOpened(private = true)
        }
}
