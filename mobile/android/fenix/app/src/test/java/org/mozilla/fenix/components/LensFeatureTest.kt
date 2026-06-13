/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
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
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.ext.components
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LensFeatureTest {
    private val testDispatcher = StandardTestDispatcher()
    private val appStore = spyk(AppStore())
    private val lensLauncher: ActivityResultLauncher<Intent> = mockk(relaxed = true)
    private val cameraPermissionLauncher: ActivityResultLauncher<String> = mockk(relaxed = true)
    private val uploader: LensImageUploader = mockk()
    private var cameraPermissionResult = PackageManager.PERMISSION_GRANTED
    private val feature = LensFeature(
        context = testContext,
        appStore = appStore,
        lensLauncher = lensLauncher,
        cameraPermissionLauncher = cameraPermissionLauncher,
        uploader = uploader,
        mainDispatcher = testDispatcher,
        permissionChecker = { _, _ -> cameraPermissionResult },
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

    @Test
    fun `GIVEN uploadFromImageUrl WHEN upload succeeds THEN the camera is not launched and LensDismissed is dispatched`() = runTest(testDispatcher) {
        coEvery { uploader.uploadFromUrl(any()) } returns "https://lens.google.com/results"
        testDispatcher.scheduler.advanceUntilIdle()

        feature.uploadFromImageUrl("https://example.com/image.jpg")
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify { uploader.uploadFromUrl("https://example.com/image.jpg") }
        verify(exactly = 0) { lensLauncher.launch(any()) }
        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN uploadFromImageUrl WHEN upload returns null THEN LensDismissed is dispatched`() = runTest(testDispatcher) {
        coEvery { uploader.uploadFromUrl(any()) } returns null
        testDispatcher.scheduler.advanceUntilIdle()

        feature.uploadFromImageUrl("https://example.com/image.jpg")
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify { uploader.uploadFromUrl("https://example.com/image.jpg") }
        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN uploadFromImageUrl WHEN upload throws IOException THEN LensDismissed is dispatched`() = runTest(testDispatcher) {
        coEvery { uploader.uploadFromUrl(any()) } throws java.io.IOException("boom")
        testDispatcher.scheduler.advanceUntilIdle()

        feature.uploadFromImageUrl("https://example.com/image.jpg")
        testDispatcher.scheduler.advanceUntilIdle()

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN the feature has been stopped WHEN uploadFromImageUrl is called THEN LensDismissed is dispatched`() = runTest(testDispatcher) {
        feature.stop()

        feature.uploadFromImageUrl("https://example.com/image.jpg")

        verify { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN private browsing mode WHEN uploadFromImageUrl succeeds THEN the result tab is opened as private`() = runTest(testDispatcher) {
        val resultUrl = "https://lens.google.com/results?private"
        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()
        coEvery { uploader.uploadFromUrl(any()) } returns resultUrl

        feature.uploadFromImageUrl("https://example.com/image.jpg")
        testDispatcher.scheduler.advanceUntilIdle()

        verify {
            testContext.components.useCases.tabsUseCases.addTab(
                url = resultUrl,
                selectTab = true,
                startLoading = true,
                private = true,
            )
        }
    }

    @Test
    fun `GIVEN LensRequestedWithImageUrl is dispatched WHEN the flow observer fires THEN uploadFromUrl runs and camera is not launched`() = runTest(testDispatcher) {
        coEvery { uploader.uploadFromUrl(any()) } returns "https://lens.google.com/results?from-observer"

        appStore.dispatch(LensAction.LensRequestedWithImageUrl("https://example.com/image.jpg"))
        testDispatcher.scheduler.advanceUntilIdle()

        coVerify { uploader.uploadFromUrl("https://example.com/image.jpg") }
        verify(exactly = 0) { lensLauncher.launch(any()) }
        verify { appStore.dispatch(LensAction.LensRequestConsumed) }
    }

    @Test
    fun `GIVEN LensRequested is dispatched WHEN the flow observer fires THEN the camera is launched and uploadFromUrl is not called`() = runTest(testDispatcher) {
        appStore.dispatch(LensAction.LensRequested)
        testDispatcher.scheduler.advanceUntilIdle()

        verify { lensLauncher.launch(any()) }
        coVerify(exactly = 0) { uploader.uploadFromUrl(any()) }
        verify { appStore.dispatch(LensAction.LensRequestConsumed) }
    }

    @Test
    fun `GIVEN camera permission is not granted WHEN LensRequested is dispatched THEN the permission launcher is invoked and the camera activity is not launched`() = runTest(testDispatcher) {
        cameraPermissionResult = PackageManager.PERMISSION_DENIED

        appStore.dispatch(LensAction.LensRequested)
        testDispatcher.scheduler.advanceUntilIdle()

        verify { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) }
        verify(exactly = 0) { lensLauncher.launch(any()) }
    }

    @Test
    fun `GIVEN onCameraPermissionResult is called with true THEN the camera activity is launched`() = runTest(testDispatcher) {
        feature.onCameraPermissionResult(isGranted = true)

        verify { lensLauncher.launch(any()) }
        verify(exactly = 0) { appStore.dispatch(LensAction.LensDismissed) }
    }

    @Test
    fun `GIVEN onCameraPermissionResult is called with false THEN LensDismissed is dispatched and the camera activity is not launched`() = runTest(testDispatcher) {
        feature.onCameraPermissionResult(isGranted = false)

        verify { appStore.dispatch(LensAction.LensDismissed) }
        verify(exactly = 0) { lensLauncher.launch(any()) }
    }

    @Test
    fun `GIVEN normal browsing mode WHEN uploadFromImageUrl succeeds THEN the result tab is opened as normal`() = runTest(testDispatcher) {
        val resultUrl = "https://lens.google.com/results?normal"
        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Normal))
        testDispatcher.scheduler.advanceUntilIdle()
        coEvery { uploader.uploadFromUrl(any()) } returns resultUrl

        feature.uploadFromImageUrl("https://example.com/image.jpg")
        testDispatcher.scheduler.advanceUntilIdle()

        verify {
            testContext.components.useCases.tabsUseCases.addTab(
                url = resultUrl,
                selectTab = true,
                startLoading = true,
                private = false,
            )
        }
    }
}
