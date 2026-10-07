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
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.qr.QrScanActivity
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.components.lens.LensCameraActivity
import org.mozilla.fenix.components.lens.LensImageSearch
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LensFeatureTest {

    private val testDispatcher = StandardTestDispatcher()
    private val appStore = spyk(AppStore())
    private val lensLauncher: ActivityResultLauncher<Intent> = mockk(relaxed = true)
    private val cameraPermissionLauncher: ActivityResultLauncher<String> = mockk(relaxed = true)
    private val lensImageSearch: LensImageSearch = mockk(relaxed = true)
    private var cameraPermissionResult = PackageManager.PERMISSION_GRANTED

    // Most tests exercise the post-acknowledgement flow; the opt-out tests below set this to false.
    private var hasAcknowledgedOptOut = true
    private val feature =
        LensFeature(
            context = testContext,
            appStore = appStore,
            lensLauncher = lensLauncher,
            cameraPermissionLauncher = cameraPermissionLauncher,
            lensImageSearch = lensImageSearch,
            mainDispatcher = testDispatcher,
            permissionChecker = { _, _ -> cameraPermissionResult },
            hasAcknowledgedOptOut = { hasAcknowledgedOptOut },
        )

    private fun imageResultIntent(source: String? = "camera") =
        mockk<Intent> {
            every { data } returns Uri.parse("content://test/image.jpg")
            every { getStringExtra(LensCameraActivity.EXTRA_IMAGE_SOURCE) } returns source
        }

    @Before
    fun setup() {
        feature.start()
    }

    @Test
    fun `GIVEN a Lens request WHEN no activity is available to handle it THEN dispatches LensDismissed`() =
        runTest(testDispatcher) {
            every { lensLauncher.launch(any()) } throws ActivityNotFoundException()

            appStore.dispatch(LensAction.LensRequested)
            testDispatcher.scheduler.advanceUntilIdle()

            verify { appStore.dispatch(LensAction.LensRequestConsumed) }
            verify { appStore.dispatch(LensAction.LensDismissed) }
        }

    @Test
    fun `GIVEN a camera image result WHEN handleImageResult is called THEN the image search is started`() =
        runTest(testDispatcher) {
            feature.handleImageResult(Activity.RESULT_OK, imageResultIntent())

            verify {
                lensImageSearch.searchWithImage(Uri.parse("content://test/image.jpg"), source = "camera")
            }
            verify(exactly = 0) { appStore.dispatch(LensAction.LensDismissed) }
        }

    @Test
    fun `GIVEN a photo picker image result WHEN handleImageResult is called THEN the photo_picker source is forwarded`() =
        runTest(testDispatcher) {
            feature.handleImageResult(Activity.RESULT_OK, imageResultIntent(source = "photo_picker"))

            verify {
                lensImageSearch.searchWithImage(Uri.parse("content://test/image.jpg"), source = "photo_picker")
            }
        }

    @Test
    fun `GIVEN a missing source extra WHEN handleImageResult is called THEN the unknown source is forwarded`() =
        runTest(testDispatcher) {
            feature.handleImageResult(Activity.RESULT_OK, imageResultIntent(source = null))

            verify {
                lensImageSearch.searchWithImage(
                    Uri.parse("content://test/image.jpg"),
                    source = LensImageSearch.SOURCE_UNKNOWN,
                )
            }
        }

    @Test
    fun `GIVEN a cancelled image result WHEN handleImageResult is called THEN dispatches LensDismissed`() =
        runTest(testDispatcher) {
            feature.handleImageResult(Activity.RESULT_CANCELED, null)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { lensImageSearch.searchWithImage(any(), any()) }
        }

    @Test
    fun `GIVEN an image result with no URI WHEN handleImageResult is called THEN dispatches LensDismissed`() =
        runTest(testDispatcher) {
            val resultData = mockk<Intent> { every { data } returns null }

            feature.handleImageResult(Activity.RESULT_OK, resultData)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { lensImageSearch.searchWithImage(any(), any()) }
        }

    @Test
    fun `GIVEN the feature has been stopped WHEN handleImageResult is called THEN the image search is still started`() =
        runTest(testDispatcher) {
            feature.stop()

            feature.handleImageResult(Activity.RESULT_OK, imageResultIntent())

            verify {
                lensImageSearch.searchWithImage(Uri.parse("content://test/image.jpg"), source = "camera")
            }
            verify(exactly = 0) { appStore.dispatch(LensAction.LensDismissed) }
        }

    @Test
    fun `GIVEN the feature was never started WHEN handleImageResult is called THEN the image search is still started`() =
        runTest(testDispatcher) {
            val neverStarted =
                LensFeature(
                    context = testContext,
                    appStore = appStore,
                    lensLauncher = lensLauncher,
                    cameraPermissionLauncher = cameraPermissionLauncher,
                    lensImageSearch = lensImageSearch,
                    mainDispatcher = testDispatcher,
                    permissionChecker = { _, _ -> cameraPermissionResult },
                    hasAcknowledgedOptOut = { hasAcknowledgedOptOut },
                )

            neverStarted.handleImageResult(Activity.RESULT_OK, imageResultIntent())

            verify {
                lensImageSearch.searchWithImage(Uri.parse("content://test/image.jpg"), source = "camera")
            }
        }

    @Test
    fun `GIVEN LensRequestedWithImageUrl is dispatched WHEN the flow observer fires THEN the image url search runs and the camera is not launched`() =
        runTest(testDispatcher) {
            appStore.dispatch(LensAction.LensRequestedWithImageUrl("https://example.com/image.jpg"))
            testDispatcher.scheduler.advanceUntilIdle()

            verify { lensImageSearch.searchWithImageUrl("https://example.com/image.jpg") }
            verify(exactly = 0) { lensLauncher.launch(any()) }
            verify { appStore.dispatch(LensAction.LensRequestConsumed) }
        }

    @Test
    fun `GIVEN LensRequested is dispatched WHEN the flow observer fires THEN the camera is launched and no image url search runs`() =
        runTest(testDispatcher) {
            appStore.dispatch(LensAction.LensRequested)
            testDispatcher.scheduler.advanceUntilIdle()

            verify { lensLauncher.launch(any()) }
            verify(exactly = 0) { lensImageSearch.searchWithImageUrl(any()) }
            verify { appStore.dispatch(LensAction.LensRequestConsumed) }
        }

    @Test
    fun `GIVEN camera permission is not granted WHEN LensRequested is dispatched THEN the permission launcher is invoked and the camera activity is not launched`() =
        runTest(testDispatcher) {
            cameraPermissionResult = PackageManager.PERMISSION_DENIED

            appStore.dispatch(LensAction.LensRequested)
            testDispatcher.scheduler.advanceUntilIdle()

            verify { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) }
            verify(exactly = 0) { lensLauncher.launch(any()) }
        }

    @Test
    fun `GIVEN the opt-out sheet has not been acknowledged WHEN LensRequested is dispatched THEN the camera activity is launched without requesting the permission`() =
        runTest(testDispatcher) {
            hasAcknowledgedOptOut = false
            cameraPermissionResult = PackageManager.PERMISSION_DENIED

            appStore.dispatch(LensAction.LensRequested)
            testDispatcher.scheduler.advanceUntilIdle()

            verify { lensLauncher.launch(any()) }
            verify(exactly = 0) { cameraPermissionLauncher.launch(any()) }
        }

    @Test
    fun `GIVEN onCameraPermissionResult is called with true THEN the camera activity is launched`() =
        runTest(testDispatcher) {
            feature.onCameraPermissionResult(isGranted = true)

            verify { lensLauncher.launch(any()) }
            verify(exactly = 0) { appStore.dispatch(LensAction.LensDismissed) }
        }

    @Test
    fun `GIVEN onCameraPermissionResult is called with false THEN LensDismissed is dispatched and the camera activity is not launched`() =
        runTest(testDispatcher) {
            feature.onCameraPermissionResult(isGranted = false)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { lensLauncher.launch(any()) }
        }

    @Test
    fun `GIVEN a QR-bearing intent WHEN handleCameraActivityResult is called THEN LensDismissed dispatches and the QR feature handles it`() =
        runTest(testDispatcher) {
            val qrFeature: QrScanFenixFeature = mockk(relaxed = true)
            val qrIntent =
                mockk<Intent> {
                    every { hasExtra(QrScanActivity.EXTRA_SCAN_RESULT_DATA) } returns true
                }

            feature.handleCameraActivityResult(Activity.RESULT_OK, qrIntent, qrFeature)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify { qrFeature.handleToolbarQrScanResults(Activity.RESULT_OK, qrIntent) }
            verify(exactly = 0) { lensImageSearch.searchWithImage(any(), any()) }
        }

    @Test
    fun `GIVEN an image intent WHEN handleCameraActivityResult is called THEN it delegates to handleImageResult`() =
        runTest(testDispatcher) {
            val qrFeature: QrScanFenixFeature = mockk(relaxed = true)
            val imageIntent =
                mockk<Intent> {
                    every { hasExtra(QrScanActivity.EXTRA_SCAN_RESULT_DATA) } returns false
                    every { data } returns Uri.parse("content://test/image.jpg")
                    every { getStringExtra(LensCameraActivity.EXTRA_IMAGE_SOURCE) } returns "camera"
                }

            feature.handleCameraActivityResult(Activity.RESULT_OK, imageIntent, qrFeature)

            verify {
                lensImageSearch.searchWithImage(Uri.parse("content://test/image.jpg"), source = "camera")
            }
            verify(exactly = 0) { qrFeature.handleToolbarQrScanResults(any(), any()) }
        }

    @Test
    fun `GIVEN a QR-bearing intent and a null QR feature WHEN handleCameraActivityResult is called THEN LensDismissed still dispatches`() =
        runTest(testDispatcher) {
            val qrIntent =
                mockk<Intent> {
                    every { hasExtra(QrScanActivity.EXTRA_SCAN_RESULT_DATA) } returns true
                }

            feature.handleCameraActivityResult(Activity.RESULT_OK, qrIntent, qrScanFeature = null)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { lensImageSearch.searchWithImage(any(), any()) }
        }

    @Test
    fun `GIVEN null intent data WHEN handleCameraActivityResult is called THEN it delegates to handleImageResult and dispatches LensDismissed`() =
        runTest(testDispatcher) {
            val qrFeature: QrScanFenixFeature = mockk(relaxed = true)

            feature.handleCameraActivityResult(Activity.RESULT_CANCELED, null, qrFeature)

            verify { appStore.dispatch(LensAction.LensDismissed) }
            verify(exactly = 0) { qrFeature.handleToolbarQrScanResults(any(), any()) }
        }
}
