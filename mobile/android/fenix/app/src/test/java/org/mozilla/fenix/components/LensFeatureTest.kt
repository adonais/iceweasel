/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LensFeatureTest {
    private val testDispatcher = StandardTestDispatcher()
    private val appStore = spyk(AppStore())
    private val lensLauncher: ActivityResultLauncher<Intent> = mockk(relaxed = true)
    private val uploader: LensImageUploader = mockk()
    private val feature = LensFeature(
        context = testContext,
        appStore = appStore,
        lensLauncher = lensLauncher,
        uploader = uploader,
        mainDispatcher = testDispatcher,
    )

    @Before
    fun setup() {
        feature.start()
    }

    @Test
    fun `GIVEN a Lens request WHEN no activity is available to handle it THEN dispatches LensDismissed`() = runTest(testDispatcher) {
        every { lensLauncher.launch(any()) } throws ActivityNotFoundException()

        appStore.dispatch(LensAction.LensRequested)
        testDispatcher.scheduler.advanceUntilIdle()

        verify { appStore.dispatch(LensAction.LensRequestConsumed) }
        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN a successful image result WHEN upload succeeds THEN dispatches LensResultAvailable`() = runTest(testDispatcher) {
        coEvery { uploader.upload(any()) } returns "https://lens.google.com/results"
        testDispatcher.scheduler.advanceUntilIdle()

        val resultData = mockk<Intent> {
            every { data } returns Uri.parse("content://test/image.jpg")
        }
        feature.handleImageResult(Activity.RESULT_OK, resultData)
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify { uploader.upload(Uri.parse("content://test/image.jpg")) }
        verify { appStore.dispatch(LensAction.LensResultAvailable("https://lens.google.com/results")) }
    }

    @Test
    fun `GIVEN a successful image result WHEN upload returns null THEN dispatches LensDismissed`() = runTest(testDispatcher) {
        coEvery { uploader.upload(any()) } returns null
        testDispatcher.scheduler.advanceUntilIdle()

        val resultData = mockk<Intent> {
            every { data } returns Uri.parse("content://test/image.jpg")
        }
        feature.handleImageResult(Activity.RESULT_OK, resultData)
        testDispatcher.scheduler.advanceUntilIdle()

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN a cancelled image result WHEN handleImageResult is called THEN dispatches LensDismissed`() = runTest(testDispatcher) {
        feature.handleImageResult(Activity.RESULT_CANCELED, null)

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN an image result with no URI WHEN handleImageResult is called THEN dispatches LensDismissed`() = runTest(testDispatcher) {
        val resultData = mockk<Intent> {
            every { data } returns null
        }
        feature.handleImageResult(Activity.RESULT_OK, resultData)

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN the feature has been stopped WHEN handleImageResult is called THEN dispatches LensDismissed`() = runTest(testDispatcher) {
        feature.stop()

        val resultData = mockk<Intent> {
            every { data } returns Uri.parse("content://test/image.jpg")
        }
        feature.handleImageResult(Activity.RESULT_OK, resultData)

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }
}
