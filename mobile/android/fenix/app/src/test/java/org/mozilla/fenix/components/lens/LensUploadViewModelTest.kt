/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.graphics.Bitmap
import android.net.Uri
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlin.math.max
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import mozilla.telemetry.glean.testing.GleanTestRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.GoogleLens
import org.mozilla.fenix.components.LensImageUploader
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LensUploadViewModelTest {
    @get:Rule val gleanTestRule = GleanTestRule(testContext)

    private val testDispatcher = StandardTestDispatcher()
    private val uploader: LensImageUploader = mockk()
    private val imageUri: Uri = Uri.parse("content://test/picked.jpg")
    private val image: Bitmap = Bitmap.createBitmap(80, 40, Bitmap.Config.ARGB_8888)
    private val resultUrl = "https://lens.google.com/results"

    private val viewModel =
        LensUploadViewModel(
            uploaderProvider = { uploader },
            mainDispatcher = testDispatcher,
            backgroundDispatcher = testDispatcher,
        )

    @Test
    fun `GIVEN a successful upload WHEN started THEN it succeeds with the result, the browsing mode and the picked image`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(image, isPrivate = true) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)

            viewModel.start(imageUri, isPrivate = true)
            testDispatcher.scheduler.advanceUntilIdle()

            val state = assertIs<LensUploadState.Succeeded>(viewModel.state.value)
            assertEquals(resultUrl, state.resultUrl)
            assertTrue(state.isPrivate)
            assertEquals(image.width, state.visual.preview.width)
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("true", events.single().extra?.get("succeeded"))
            assertEquals("200", events.single().extra?.get("http_status_code"))
            assertEquals("photo_picker", events.single().extra?.get("source"))
        }

    @Test
    fun `WHEN started THEN it is loading without an image until the image is decoded`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(any(), any()) } coAnswers
                {
                    CompletableDeferred<LensImageUploader.UploadResult>().await()
                }

            viewModel.start(imageUri, isPrivate = false)

            assertEquals(LensUploadState.Loading(visual = null), viewModel.state.value)

            testDispatcher.scheduler.advanceUntilIdle()

            val state = assertIs<LensUploadState.Loading>(viewModel.state.value)
            assertNotNull(state.visual)
        }

    @Test
    fun `GIVEN the image cannot be decoded WHEN started THEN it fails to load the image without uploading and records the failure`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns null

            viewModel.start(imageUri, isPrivate = false)
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(
                LensUploadState.Failed(LensUploadFailure.IMAGE_LOAD, imageUri, isPrivate = false),
                viewModel.state.value,
            )
            coVerify(exactly = 0) { uploader.uploadImage(any(), any()) }
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("false", events.single().extra?.get("succeeded"))
            assertNull(events.single().extra?.get("http_status_code"))
        }

    @Test
    fun `GIVEN the upload produces no result WHEN started THEN the upload fails and records the status code`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = null, httpStatusCode = 400)

            viewModel.start(imageUri, isPrivate = false)
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(
                LensUploadState.Failed(LensUploadFailure.UPLOAD, imageUri, isPrivate = false),
                viewModel.state.value,
            )
            val events = GoogleLens.searchCompleted.testGetValue()
            assertNotNull(events)
            assertEquals("false", events.single().extra?.get("succeeded"))
            assertEquals("400", events.single().extra?.get("http_status_code"))
        }

    @Test
    fun `GIVEN the photo picker grant was revoked WHEN started THEN the SecurityException is handled as an image load failure`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } throws SecurityException("revoked")

            viewModel.start(imageUri, isPrivate = false)
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(
                LensUploadState.Failed(LensUploadFailure.IMAGE_LOAD, imageUri, isPrivate = false),
                viewModel.state.value,
            )
        }

    @Test
    fun `GIVEN the upload throws IOException WHEN started THEN it is handled as an upload failure that keeps the image and mode to retry`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(any(), any()) } throws IOException("offline")

            viewModel.start(imageUri, isPrivate = true)
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(
                LensUploadState.Failed(LensUploadFailure.UPLOAD, imageUri, isPrivate = true),
                viewModel.state.value,
            )
        }

    @Test
    fun `GIVEN an upload is running WHEN it is cancelled THEN it is idle, records nothing and ignores the late result`() =
        runTest(testDispatcher) {
            val pendingUpload = CompletableDeferred<LensImageUploader.UploadResult>()
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(any(), any()) } coAnswers { pendingUpload.await() }
            viewModel.start(imageUri, isPrivate = false)
            testDispatcher.scheduler.advanceUntilIdle()

            assertTrue(viewModel.cancel())
            pendingUpload.complete(LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200))
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(LensUploadState.Idle, viewModel.state.value)
            assertNull(GoogleLens.searchCompleted.testGetValue())
        }

    @Test
    fun `GIVEN the upload succeeded WHEN cancel is called THEN nothing changes`() =
        runTest(testDispatcher) {
            coEvery { uploader.decodeImage(imageUri) } returns image
            coEvery { uploader.uploadImage(any(), any()) } returns
                LensImageUploader.UploadResult(resultUrl = resultUrl, httpStatusCode = 200)
            viewModel.start(imageUri, isPrivate = false)
            testDispatcher.scheduler.advanceUntilIdle()

            assertFalse(viewModel.cancel())
            assertIs<LensUploadState.Succeeded>(viewModel.state.value)
        }

    @Test
    fun `GIVEN an upload-sized image WHEN shrunk for the backdrop THEN it fits the backdrop size and keeps its shape`() {
        val shrunk = shrinkForBackdrop(Bitmap.createBitmap(1000, 750, Bitmap.Config.ARGB_8888))

        assertTrue(max(shrunk.width, shrunk.height) <= 32)
        assertEquals(1000f / 750f, shrunk.width.toFloat() / shrunk.height, 0.1f)
    }

    @Test
    fun `GIVEN an image already smaller than the backdrop WHEN shrunk for the backdrop THEN it is used as is`() {
        val tiny = Bitmap.createBitmap(20, 10, Bitmap.Config.ARGB_8888)

        assertSame(tiny, shrinkForBackdrop(tiny))
    }
}
