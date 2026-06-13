/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.content.Context
import android.graphics.Insets
import android.graphics.Point
import android.graphics.Rect
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.Image
import android.media.ImageReader
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import android.view.Display
import android.view.Surface
import android.view.WindowInsets
import android.view.WindowManager
import android.view.WindowMetrics
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import kotlin.test.assertNotNull

@RunWith(RobolectricTestRunner::class)
class LensCameraFragmentTest {

    // --- Lifecycle tests ---

    @Test
    fun `GIVEN fragment is pausing WHEN onPause is called THEN stopServices is invoked`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.stopServices() } just Runs

        fragment.onPause()

        verify { fragment.stopServices() }
    }

    @Test
    fun `GIVEN fragment is resuming WHEN onResume is called THEN startCamera is invoked`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.startCamera() } just Runs

        fragment.onResume()

        verify { fragment.startCamera() }
    }

    @Test
    fun `GIVEN textureView is available WHEN startCamera is called THEN tryOpenCamera is invoked`() {
        val fragment = spyk(LensCameraFragment())
        val textureView: AutoFitTextureView = mockk(relaxed = true)
        every { textureView.isAvailable } returns true
        every { textureView.width } returns 1920
        every { textureView.height } returns 1080
        fragment.textureView = textureView
        every { fragment.maybeStartBackgroundThread() } just Runs
        every { fragment.maybeStartExecutorService() } just Runs
        every { fragment.tryOpenCamera(any(), any()) } just Runs

        fragment.startCamera()

        verify { fragment.maybeStartBackgroundThread() }
        verify { fragment.tryOpenCamera(1920, 1080) }
    }

    @Test
    fun `GIVEN textureView is unavailable WHEN startCamera is called THEN surfaceTextureListener is set`() {
        val fragment = spyk(LensCameraFragment())
        val textureView: AutoFitTextureView = mockk(relaxed = true)
        every { textureView.isAvailable } returns false
        fragment.textureView = textureView
        every { fragment.maybeStartBackgroundThread() } just Runs
        every { fragment.maybeStartExecutorService() } just Runs

        fragment.startCamera()

        verify { textureView.surfaceTextureListener = any() }
    }

    // --- tryOpenCamera tests ---

    @Test
    fun `GIVEN no camera available WHEN tryOpenCamera is called THEN showCameraError is true`() {
        val fragment = spyk(LensCameraFragment())
        fragment.textureView = mockk(relaxed = true)

        every { fragment.deviceHasCamera() } returns false

        fragment.tryOpenCamera(0, 0)

        assertTrue(fragment.showCameraError.value)
    }

    @Test
    fun `GIVEN camera is available WHEN tryOpenCamera is called THEN showCameraError is false`() {
        val fragment = spyk(LensCameraFragment())
        fragment.textureView = mockk(relaxed = true)

        every { fragment.deviceHasCamera() } returns true
        every { fragment.openCamera(any(), any()) } just Runs

        fragment.tryOpenCamera(1920, 1080)

        verify { fragment.openCamera(1920, 1080) }
        assertFalse(fragment.showCameraError.value)
    }

    @Test
    fun `GIVEN camera throws exception WHEN tryOpenCamera is called THEN showCameraError is true`() {
        val fragment = spyk(LensCameraFragment())
        fragment.textureView = mockk(relaxed = true)

        every { fragment.deviceHasCamera() } returns true
        every { fragment.openCamera(any(), any()) } throws IllegalStateException("no camera")

        fragment.tryOpenCamera(0, 0)

        assertTrue(fragment.showCameraError.value)
    }

    // --- openCamera tests ---

    @Test
    fun `GIVEN camera throws CameraAccessException WHEN openCamera is called THEN exception is caught and handled`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.setUpCameraOutputs(any(), any()) } just Runs

        val cameraManager: CameraManager = mockk()
        every { cameraManager.openCamera(any<String>(), any<CameraDevice.StateCallback>(), any()) } throws
            CameraAccessException(CameraAccessException.CAMERA_ERROR)

        val activity: FragmentActivity = mockk()
        every { activity.getSystemService(Context.CAMERA_SERVICE) } returns cameraManager
        every { fragment.activity } returns activity
        fragment.cameraId = "mockCamera"

        try {
            fragment.openCamera(1920, 1080)
        } catch (e: CameraAccessException) {
            fail("CameraAccessException should have been caught and logged, not re-thrown.")
        }
    }

    @Test
    fun `GIVEN no camera ID is set WHEN openCamera is called THEN IllegalStateException is thrown`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.setUpCameraOutputs(any(), any()) } just Runs

        val cameraManager: CameraManager = mockk()
        val activity: FragmentActivity = mockk()
        every { activity.getSystemService(Context.CAMERA_SERVICE) } returns cameraManager
        every { fragment.activity } returns activity
        fragment.cameraId = null

        try {
            fragment.openCamera(1920, 1080)
            fail("Expected IllegalStateException")
        } catch (e: IllegalStateException) {
            assertEquals("No camera found on device", e.message)
        }
    }

    // --- stateCallback tests ---

    @Test
    fun `GIVEN camera device exists WHEN stateCallback onDisconnected is called THEN cameraDevice is null`() {
        val fragment = LensCameraFragment()
        fragment.cameraDevice = mockk(relaxed = true)

        fragment.stateCallback.onDisconnected(fragment.cameraDevice!!)

        assertNull(fragment.cameraDevice)
    }

    @Test
    fun `GIVEN camera device exists WHEN stateCallback onError is called THEN cameraDevice is null`() {
        val fragment = LensCameraFragment()
        fragment.cameraDevice = mockk(relaxed = true)

        fragment.stateCallback.onError(fragment.cameraDevice!!, 0)

        assertNull(fragment.cameraDevice)
    }

    // --- createCameraPreviewSession tests ---

    @Test
    fun `GIVEN previewSize is null WHEN createCameraPreviewSession is called THEN it returns early`() {
        val fragment = spyk(LensCameraFragment())
        fragment.cameraDevice = mockk(relaxed = true)

        val textureView: AutoFitTextureView = mockk(relaxed = true)
        every { textureView.surfaceTexture } returns mockk(relaxed = true)
        fragment.textureView = textureView
        fragment.previewSize = null

        fragment.createCameraPreviewSession()
    }

    @Test
    fun `GIVEN imageReader surface is null WHEN createCameraPreviewSession is called THEN it does not crash`() {
        val fragment = spyk(LensCameraFragment())
        fragment.cameraDevice = mockk(relaxed = true)

        val imageReader: ImageReader = mockk()
        every { imageReader.surface } returns null
        fragment.imageReader = imageReader

        val textureView: AutoFitTextureView = mockk(relaxed = true)
        every { textureView.surfaceTexture } returns mockk(relaxed = true)
        fragment.textureView = textureView

        fragment.previewSize = Size(1920, 1080)

        try {
            fragment.createCameraPreviewSession()
        } catch (e: NullPointerException) {
            fail("NullPointerException should not have been thrown.")
        }
    }

    // --- chooseOptimalSize tests ---

    @Test(expected = IllegalArgumentException::class)
    fun `GIVEN empty size array WHEN chooseOptimalSize is called THEN IllegalArgumentException is thrown`() {
        LensCameraFragment.chooseOptimalSize(emptyArray(), 640, 480, 1920, 1080, Size(4, 3))
    }

    @Test
    fun `GIVEN big-enough sizes with matching aspect ratio WHEN chooseOptimalSize is called THEN smallest matching size is returned`() {
        val size = LensCameraFragment.chooseOptimalSize(
            arrayOf(Size(640, 480), Size(1024, 768)),
            640,
            480,
            1920,
            1080,
            Size(4, 3),
        )

        assertEquals(640, size.width)
        assertEquals(480, size.height)
    }

    @Test
    fun `GIVEN no big-enough sizes WHEN chooseOptimalSize is called THEN largest not-big-enough size is returned`() {
        val size = LensCameraFragment.chooseOptimalSize(
            arrayOf(Size(320, 240), Size(640, 480)),
            1024,
            768,
            1920,
            1080,
            Size(4, 3),
        )

        assertEquals(640, size.width)
        assertEquals(480, size.height)
    }

    @Test
    fun `GIVEN no aspect ratio match WHEN chooseOptimalSize is called THEN first choice is returned`() {
        val size = LensCameraFragment.chooseOptimalSize(
            arrayOf(Size(1024, 768), Size(786, 480)),
            2048,
            1024,
            1920,
            1080,
            Size(16, 9),
        )

        assertEquals(1024, size.width)
        assertEquals(768, size.height)
    }

    @Test
    fun `GIVEN sizes exceeding max dimensions WHEN chooseOptimalSize is called THEN oversized entries are filtered out`() {
        val size = LensCameraFragment.chooseOptimalSize(
            arrayOf(Size(2560, 1920), Size(1024, 768), Size(640, 480)),
            640,
            480,
            1920,
            1080,
            Size(4, 3),
        )

        assertEquals(640, size.width)
        assertEquals(480, size.height)
    }

    // --- chooseCaptureSizeFromList tests ---

    @Test
    fun `GIVEN sizes within MAX_CAPTURE_DIMENSION WHEN chooseCaptureSizeFromList is called THEN largest valid size is returned`() {
        val size = LensCameraFragment.chooseCaptureSizeFromList(
            arrayOf(Size(3264, 2448), Size(1920, 1080), Size(640, 480)),
        )

        assertEquals(3264, size.width)
        assertEquals(2448, size.height)
    }

    @Test
    fun `GIVEN sizes exceeding MAX_CAPTURE_DIMENSION WHEN chooseCaptureSizeFromList is called THEN oversized entries are filtered out`() {
        val size = LensCameraFragment.chooseCaptureSizeFromList(
            arrayOf(Size(5000, 4000), Size(3264, 2448)),
        )

        assertEquals(3264, size.width)
        assertEquals(2448, size.height)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `GIVEN empty size array WHEN chooseCaptureSizeFromList is called THEN IllegalArgumentException is thrown`() {
        LensCameraFragment.chooseCaptureSizeFromList(emptyArray())
    }

    @Test
    fun `GIVEN all sizes exceed MAX_CAPTURE_DIMENSION WHEN chooseCaptureSizeFromList is called THEN first element is returned as fallback`() {
        val size = LensCameraFragment.chooseCaptureSizeFromList(
            arrayOf(Size(5000, 5000), Size(4500, 4500)),
        )

        assertEquals(5000, size.width)
        assertEquals(5000, size.height)
    }

    // --- getDisplaySize tests ---

    @Test
    @Suppress("DEPRECATION")
    @Config(sdk = [Build.VERSION_CODES.Q])
    fun `GIVEN SDK is below 30 WHEN getDisplaySize is called THEN defaultDisplay getSize is used`() {
        val mockManager: WindowManager = mockk()
        val mockDisplay: Display = mockk()

        every { mockManager.defaultDisplay } returns mockDisplay
        every { mockDisplay.getSize(any()) } just Runs

        LensCameraFragment.getDisplaySize(mockManager)

        verify { mockDisplay.getSize(any()) }
    }

    @Test
    fun `GIVEN SDK is 30 or above WHEN getDisplaySize is called THEN currentWindowMetrics is used`() {
        val mockManager: WindowManager = mockk()
        val mockWindowMetrics: WindowMetrics = mockk()

        val bounds = Rect(0, 0, 170, 270)
        val insets = Insets.of(10, 10, 10, 10)
        val expectedSize = Point(150, 250)

        val mockWindowInsets: WindowInsets = mockk()
        every {
            mockWindowInsets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.navigationBars() or WindowInsetsCompat.Type.displayCutout(),
            )
        } returns insets

        every { mockManager.currentWindowMetrics } returns mockWindowMetrics
        every { mockWindowMetrics.windowInsets } returns mockWindowInsets
        every { mockWindowMetrics.bounds } returns bounds

        val result = LensCameraFragment.getDisplaySize(mockManager)

        assertEquals(expectedSize, result)
    }

    // --- getScreenRotation tests ---

    @Test
    fun `GIVEN SDK is 30 or above WHEN getScreenRotation is called THEN context display is used`() {
        val fragment = spyk(LensCameraFragment())
        val mockContext: FragmentActivity = mockk()
        val mockDisplay: Display = mockk()

        every { fragment.context } returns mockContext
        every { mockContext.display } returns mockDisplay
        every { mockDisplay.rotation } returns Surface.ROTATION_90

        val rotation = fragment.getScreenRotation()

        assertEquals(Surface.ROTATION_90, rotation)
    }

    @Test
    @Suppress("DEPRECATION")
    @Config(sdk = [Build.VERSION_CODES.Q])
    fun `GIVEN SDK is below 30 WHEN getScreenRotation is called THEN windowManager defaultDisplay is used`() {
        val fragment = spyk(LensCameraFragment())
        val mockActivity: FragmentActivity = mockk()
        val mockManager: WindowManager = mockk()
        val mockDisplay: Display = mockk()

        every { fragment.context } returns null
        every { fragment.activity } returns mockActivity
        every { mockActivity.windowManager } returns mockManager
        every { mockManager.defaultDisplay } returns mockDisplay
        every { mockDisplay.rotation } returns Surface.ROTATION_90

        val rotation = fragment.getScreenRotation()

        assertEquals(Surface.ROTATION_90, rotation)
    }

    // --- configureTransform tests ---

    @Test
    fun `GIVEN textureView and previewSize are set WHEN configureTransform is called THEN getScreenRotation is invoked`() {
        val fragment = spyk(LensCameraFragment())
        val textureView: AutoFitTextureView = mockk(relaxed = true)
        fragment.textureView = textureView
        fragment.previewSize = Size(4, 4)

        fragment.configureTransform(4, 4)

        verify { fragment.getScreenRotation() }
    }

    // --- Background thread and executor tests ---

    @Test
    fun `GIVEN background thread is already alive WHEN maybeStartBackgroundThread is called THEN existing thread is reused`() {
        val fragment = LensCameraFragment()
        val existingThread = HandlerThread("test").apply { start() }
        val existingHandler: Handler = mockk()
        fragment.backgroundThread = existingThread
        fragment.backgroundHandler = existingHandler

        fragment.maybeStartBackgroundThread()

        assertSame(existingThread, fragment.backgroundThread)
        assertSame(existingHandler, fragment.backgroundHandler)

        existingThread.quitSafely()
        existingThread.join()
    }

    @Test
    fun `GIVEN background thread is null WHEN maybeStartBackgroundThread is called THEN new thread is created`() {
        val fragment = LensCameraFragment()
        fragment.backgroundThread = null
        fragment.backgroundHandler = null

        fragment.maybeStartBackgroundThread()

        assertNotNull(fragment.backgroundThread)
        assertTrue(fragment.backgroundThread!!.isAlive)
        assertNotNull(fragment.backgroundHandler)

        fragment.backgroundThread?.quitSafely()
        fragment.backgroundThread?.join()
    }

    @Test
    fun `GIVEN executor service already exists WHEN maybeStartExecutorService is called THEN existing executor is reused`() {
        val fragment = LensCameraFragment()
        val existingExecutor: ExecutorService = mockk()
        fragment.backgroundExecutor = existingExecutor

        fragment.maybeStartExecutorService()

        assertSame(existingExecutor, fragment.backgroundExecutor)
    }

    @Test
    fun `GIVEN executor service is null WHEN maybeStartExecutorService is called THEN new executor is created`() {
        val fragment = LensCameraFragment()
        fragment.backgroundExecutor = null

        fragment.maybeStartExecutorService()

        assertNotNull(fragment.backgroundExecutor)
    }

    // --- onImageAvailableListener tests ---

    @Test
    fun `GIVEN disk write fails WHEN onImageAvailableListener processes image THEN handleResult is called with null`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.handleResult(any()) } just Runs

        val mockContext: Context = mockk()
        val readOnlyDir = File("/non_existent_read_only_path")
        every { mockContext.applicationContext } returns mockContext
        every { mockContext.cacheDir } returns readOnlyDir
        every { mockContext.packageName } returns "org.mozilla.fenix"
        every { fragment.context } returns mockContext

        val buffer = ByteBuffer.wrap(byteArrayOf(1, 2, 3))
        val mockPlane: Image.Plane = mockk()
        every { mockPlane.buffer } returns buffer

        val mockImage: Image = mockk()
        every { mockImage.planes } returns arrayOf(mockPlane)
        every { mockImage.close() } just Runs

        val mockReader: ImageReader = mockk()
        every { mockReader.acquireLatestImage() } returns mockImage

        fragment.processImage(mockReader)
        ShadowLooper.idleMainLooper()

        verify { fragment.handleResult(null) }
        verify { mockImage.close() }
    }

    @Test
    fun `GIVEN image write succeeds WHEN onImageAvailableListener processes image THEN handleResult is called with URI`() {
        val fragment = spyk(LensCameraFragment())
        every { fragment.handleResult(any()) } just Runs

        val tempDir = File(System.getProperty("java.io.tmpdir"), "lens_test_${System.currentTimeMillis()}")
        tempDir.mkdirs()

        val expectedUri: Uri = mockk()
        fragment.getUriForFile = { _, _, _ -> expectedUri }

        val mockContext: Context = mockk()
        every { mockContext.applicationContext } returns mockContext
        every { mockContext.cacheDir } returns tempDir
        every { mockContext.packageName } returns "org.mozilla.fenix"
        every { fragment.context } returns mockContext

        val buffer = ByteBuffer.wrap(byteArrayOf(1, 2, 3))
        val mockPlane: Image.Plane = mockk()
        every { mockPlane.buffer } returns buffer

        val mockImage: Image = mockk()
        every { mockImage.planes } returns arrayOf(mockPlane)
        every { mockImage.close() } just Runs

        val mockReader: ImageReader = mockk()
        every { mockReader.acquireLatestImage() } returns mockImage

        fragment.processImage(mockReader)
        ShadowLooper.idleMainLooper()

        verify { fragment.handleResult(expectedUri) }
        verify { mockImage.close() }

        tempDir.deleteRecursively()
    }
}
