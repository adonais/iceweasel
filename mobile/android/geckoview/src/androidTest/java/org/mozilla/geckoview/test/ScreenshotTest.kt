/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.SurfaceTexture
import android.view.Surface
import androidx.core.graphics.createBitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import androidx.test.platform.app.InstrumentationRegistry
import kotlin.math.absoluteValue
import kotlin.math.max
import kotlin.test.assertIs
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.sameInstance
import org.junit.Assert.fail
import org.junit.Assume.assumeThat
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.geckoview.GeckoDisplay.SurfaceInfo
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoResult.OnExceptionListener
import org.mozilla.geckoview.GeckoResult.fromException
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.ContentDelegate
import org.mozilla.geckoview.GeckoSession.ProgressDelegate
import org.mozilla.geckoview.test.rule.GeckoSessionTestRule.AssertCalled
import org.mozilla.geckoview.test.rule.GeckoSessionTestRule.WithDisplay
import org.mozilla.geckoview.test.util.UiThreadUtils

private const val SCREEN_HEIGHT = 800
private const val SCREEN_WIDTH = 800
private const val BIG_SCREEN_HEIGHT = 999999
private const val BIG_SCREEN_WIDTH = 999999

// Per-channel tolerance when checking that a captured pixel is the solid green
// (#00ff00) that fullpage.html paints.
private const val GREEN_TOLERANCE = 12

@RunWith(AndroidJUnit4::class)
@MediumTest
class ScreenshotTest : BaseSessionTest() {
    private fun getComparisonScreenshot(width: Int, height: Int): Bitmap {
        val screenshotFile = createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(screenshotFile)
        val paint = Paint()
        paint.shader =
            LinearGradient(0f, 0f, width.toFloat(), height.toFloat(), Color.RED, Color.WHITE, Shader.TileMode.MIRROR)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        return screenshotFile
    }

    companion object {
        /** Compares two Bitmaps and returns the largest color element difference (red, green or blue) */
        public fun imageElementDifference(b1: Bitmap, b2: Bitmap): Int {
            return if (b1.width == b2.width && b1.height == b2.height) {
                val pixels1 = IntArray(b1.width * b1.height)
                val pixels2 = IntArray(b2.width * b2.height)
                b1.getPixels(pixels1, 0, b1.width, 0, 0, b1.width, b1.height)
                b2.getPixels(pixels2, 0, b2.width, 0, 0, b2.width, b2.height)
                var maxDiff = 0
                for (i in 0 until pixels1.size) {
                    val redDiff = (Color.red(pixels1[i]) - Color.red(pixels2[i])).absoluteValue
                    val greenDiff = (Color.green(pixels1[i]) - Color.green(pixels2[i])).absoluteValue
                    val blueDiff = (Color.blue(pixels1[i]) - Color.blue(pixels2[i])).absoluteValue
                    maxDiff = max(maxDiff, max(redDiff, max(greenDiff, blueDiff)))
                }
                maxDiff
            } else {
                256
            }
        }
    }

    private fun assertScreenshotResult(result: GeckoResult<Bitmap>, comparisonImage: Bitmap) {
        sessionRule.waitForResult(result).let {
            assertThat(
                "Screenshot is not null",
                it,
                notNullValue(),
            )
            assertThat("Widths are the same", comparisonImage.width, equalTo(it.width))
            assertThat("Heights are the same", comparisonImage.height, equalTo(it.height))
            assertThat("Byte counts are the same", comparisonImage.byteCount, equalTo(it.byteCount))
            assertThat("Configs are the same", comparisonImage.config, equalTo(it.config))
            assertThat(
                "Images are almost identical",
                imageElementDifference(comparisonImage, it),
                lessThanOrEqualTo(2),
            )
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsSucceeds() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.capturePixels(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsCanBeCalledMultipleTimes() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            val call1 = it.capturePixels()
            val call2 = it.capturePixels()
            val call3 = it.capturePixels()
            assertScreenshotResult(call1, screenshotFile)
            assertScreenshotResult(call2, screenshotFile)
            assertScreenshotResult(call3, screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsCompletesCompositorPausedRestarted() {
        sessionRule.display?.let {
            it.surfaceDestroyed()
            val result = it.capturePixels()
            val texture = SurfaceTexture(0)
            texture.setDefaultBufferSize(SCREEN_WIDTH, SCREEN_HEIGHT)
            val surface = Surface(texture)
            it.surfaceChanged(SurfaceInfo.Builder(surface).size(SCREEN_WIDTH, SCREEN_HEIGHT).build())
            sessionRule.waitForResult(result)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsFailsWhenCompositorNotReady() {
        sessionRule.display?.let { display ->
            mainSession.close()
            var exceptionListenerCalled = false
            val result = display.capturePixels()
            result
                .exceptionally { error: Throwable ->
                    assertIs<IllegalStateException>(error)
                    exceptionListenerCalled = true
                    result
                }
                .accept {
                    fail("screenshot shouldn't complete successfully after session is closed")
                }
            UiThreadUtils.waitForCondition(
                { exceptionListenerCalled },
                sessionRule.env.defaultTimeoutMillis,
            )
        } ?: run { fail("no display found") }
    }

    // This tests tries to catch problems like Bug 1644561.
    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsStressTest() {
        val screenshots = mutableListOf<GeckoResult<Bitmap>>()
        sessionRule.display?.let {
            for (i in 0..100) {
                screenshots.add(it.capturePixels())
            }

            for (i in 0..50) {
                sessionRule.waitForResult(screenshots[i])
            }

            it.surfaceDestroyed()
            screenshots.add(it.capturePixels())
            it.surfaceDestroyed()

            val texture = SurfaceTexture(0)
            texture.setDefaultBufferSize(SCREEN_WIDTH, SCREEN_HEIGHT)
            val surface = Surface(texture)
            it.surfaceChanged(SurfaceInfo.Builder(surface).size(SCREEN_WIDTH, SCREEN_HEIGHT).build())

            for (i in 0..100) {
                screenshots.add(it.capturePixels())
            }

            for (i in 0..100) {
                it.surfaceDestroyed()
                screenshots.add(it.capturePixels())
                val newTexture = SurfaceTexture(0)
                newTexture.setDefaultBufferSize(SCREEN_WIDTH, SCREEN_HEIGHT)
                val newSurface = Surface(newTexture)
                it.surfaceChanged(SurfaceInfo.Builder(newSurface).size(SCREEN_WIDTH, SCREEN_HEIGHT).build())
            }

            try {
                for (result in screenshots) {
                    sessionRule.waitForResult(result)
                }
            } catch (ex: RuntimeException) {
                // Rejecting the screenshot is fine
            }
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test(expected = IllegalStateException::class)
    fun capturePixelsFailsCompositorPaused() {
        sessionRule.display?.let {
            it.surfaceDestroyed()
            val result = it.capturePixels()
            it.surfaceDestroyed()

            sessionRule.waitForResult(result)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsBeforeAndAfterCompositorPausedRestarted() {
        sessionRule.display?.let {
            val result1 = it.capturePixels()
            val texture = SurfaceTexture(0)
            it.surfaceDestroyed()

            val result2 = it.capturePixels()
            texture.setDefaultBufferSize(SCREEN_WIDTH, SCREEN_HEIGHT / 2)
            val surface = Surface(texture)
            it.surfaceChanged(SurfaceInfo.Builder(surface).size(SCREEN_WIDTH, SCREEN_HEIGHT / 2).build())

            // The first screenshot will fail due to the compositor being paused, but we expect the
            // second screenshot to succeed.
            try {
                sessionRule.waitForResult(result1)
            } catch (e: IllegalStateException) {}
            sessionRule.waitForResult(result2)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun capturePixelsWhileSessionDeactivated() {
        // TODO: Bug 1837551
        assumeThat(sessionRule.env.isFission, equalTo(false))
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        mainSession.setActive(false)

        // Deactivating the session should trigger a flush state change
        sessionRule.waitUntilCalled(
            object : ProgressDelegate {
                @AssertCalled(count = 1)
                override fun onSessionStateChange(
                    session: GeckoSession,
                    sessionState: GeckoSession.SessionState,
                ) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.capturePixels(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotToBitmap() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.screenshot().capture(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotScaledToSize() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.screenshot().size(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2).capture(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenShotScaledWithScale() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.screenshot().scale(0.5f).capture(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenShotScaledWithAspectPreservingSize() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.screenshot().aspectPreservingSize(SCREEN_WIDTH / 2).capture(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun recycleBitmap() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            val call1 = it.screenshot().capture()
            assertScreenshotResult(call1, screenshotFile)
            val call2 = it.screenshot().bitmap(call1.poll(1000)).capture()
            assertScreenshotResult(call2, screenshotFile)
            val call3 = it.screenshot().bitmap(call2.poll(1000)).capture()
            assertScreenshotResult(call3, screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotWholeRegion() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH, SCREEN_HEIGHT)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(it.screenshot().source(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).capture(), screenshotFile)
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotWholeRegionScaled() {
        val screenshotFile = getComparisonScreenshot(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)

        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(
                it.screenshot()
                    .source(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
                    .size(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                    .capture(),
                screenshotFile,
            )
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotQuarters() {
        val res = InstrumentationRegistry.getInstrumentation().targetContext.resources
        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(
                it.screenshot().source(0, 0, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2).capture(),
                BitmapFactory.decodeResource(res, R.drawable.colors_tl),
            )
            assertScreenshotResult(
                it.screenshot()
                    .source(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                    .capture(),
                BitmapFactory.decodeResource(res, R.drawable.colors_br),
            )
        }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun screenshotQuartersScaled() {
        val res = InstrumentationRegistry.getInstrumentation().targetContext.resources
        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )

        sessionRule.display?.let {
            assertScreenshotResult(
                it.screenshot()
                    .source(0, 0, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                    .size(SCREEN_WIDTH / 4, SCREEN_WIDTH / 4)
                    .capture(),
                BitmapFactory.decodeResource(res, R.drawable.colors_tl_scaled),
            )
            assertScreenshotResult(
                it.screenshot()
                    .source(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                    .size(SCREEN_WIDTH / 4, SCREEN_WIDTH / 4)
                    .capture(),
                BitmapFactory.decodeResource(res, R.drawable.colors_br_scaled),
            )
        }
    }

    @WithDisplay(height = BIG_SCREEN_HEIGHT, width = BIG_SCREEN_WIDTH)
    @Test
    fun giantScreenshot() {
        mainSession.loadTestPath(COLORS_HTML_PATH)
        sessionRule.display
            ?.screenshot()!!
            .source(0, 0, BIG_SCREEN_WIDTH, BIG_SCREEN_HEIGHT)
            .size(BIG_SCREEN_WIDTH, BIG_SCREEN_HEIGHT)
            .capture()
            .exceptionally(
                OnExceptionListener<Throwable> { error: Throwable ->
                    assertIs<OutOfMemoryError>(error)
                    fromException(error)
                }
            )
    }

    private fun loadFullPage() {
        mainSession.loadTestPath(FULLPAGE_HTML_PATH)
        sessionRule.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onFirstContentfulPaint(session: GeckoSession) {}
            }
        )
    }

    /**
     * The size, in device pixels, that captureFullPage is expected to produce for the current document when no scaling
     * is requested: the root element's scrollable size (CSS pixels) times the device pixel ratio, matching the math in
     * ScreenshotBuilder#captureFullPage.
     */
    private fun expectedFullPageSize(): Pair<Int, Int> {
        val dpr = (mainSession.evaluateJS("window.devicePixelRatio") as Number).toDouble()
        val cssWidth = (mainSession.evaluateJS("document.documentElement.scrollWidth") as Number).toDouble()
        val cssHeight = (mainSession.evaluateJS("document.documentElement.scrollHeight") as Number).toDouble()
        return Pair((cssWidth * dpr).toInt(), (cssHeight * dpr).toInt())
    }

    private fun assertDimensionApprox(name: String, actual: Int, expected: Int, tolerance: Int = 2) {
        assertThat(
            "$name ($actual) should be within $tolerance of $expected",
            (actual - expected).absoluteValue,
            lessThanOrEqualTo(tolerance),
        )
    }

    private fun assertPixelIsGreen(bitmap: Bitmap, x: Int, y: Int) {
        val pixel = bitmap.getPixel(x, y)
        assertThat("Red channel at ($x, $y)", Color.red(pixel), lessThanOrEqualTo(GREEN_TOLERANCE))
        assertThat(
            "Green channel at ($x, $y)",
            Color.green(pixel),
            greaterThanOrEqualTo(255 - GREEN_TOLERANCE),
        )
        assertThat("Blue channel at ($x, $y)", Color.blue(pixel), lessThanOrEqualTo(GREEN_TOLERANCE))
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageOffscreenContent() {
        loadFullPage()
        val (expectedWidth, expectedHeight) = expectedFullPageSize()

        sessionRule.display?.let {
            val bitmap = sessionRule.waitForResult(it.captureFullPage())
            assertThat("Screenshot is not null", bitmap, notNullValue())
            // The page is much taller than the viewport, so a full page capture must be taller than
            // the on-screen surface.
            assertThat(
                "Full page capture is taller than the visible surface",
                bitmap.height,
                greaterThan(SCREEN_HEIGHT),
            )
            assertDimensionApprox("Full page width", bitmap.width, expectedWidth)
            assertDimensionApprox("Full page height", bitmap.height, expectedHeight)
            // A pixel well below the viewport must be the page's green background, proving the
            // off-screen content was actually painted.
            assertPixelIsGreen(bitmap, bitmap.width / 2, bitmap.height * 3 / 4)
            assertPixelIsGreen(bitmap, bitmap.width / 2, bitmap.height / 2)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageScaled() {
        loadFullPage()
        val (fullWidth, fullHeight) = expectedFullPageSize()

        sessionRule.display?.let {
            val bitmap = sessionRule.waitForResult(it.screenshot().scale(0.5f).captureFullPage())
            assertDimensionApprox("Scaled width", bitmap.width, (fullWidth * 0.5f).toInt())
            assertDimensionApprox("Scaled height", bitmap.height, (fullHeight * 0.5f).toInt())
            assertPixelIsGreen(bitmap, bitmap.width / 2, bitmap.height / 2)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageToSize() {
        loadFullPage()

        sessionRule.display?.let {
            val bitmap = sessionRule.waitForResult(it.screenshot().size(400, 600).captureFullPage())
            assertThat("Width matches requested size", bitmap.width, equalTo(400))
            assertThat("Height matches requested size", bitmap.height, equalTo(600))
            // Content is drawn from the top-left origin, so that corner is always covered even if
            // the requested aspect ratio differs from the page and leaves letterbox bars elsewhere.
            assertPixelIsGreen(bitmap, 5, 5)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageAspectPreserving() {
        loadFullPage()
        val (fullWidth, fullHeight) = expectedFullPageSize()
        val requestedWidth = fullWidth / 2

        sessionRule.display?.let {
            val bitmap =
                sessionRule.waitForResult(it.screenshot().aspectPreservingSize(requestedWidth).captureFullPage())
            assertThat("Width matches requested width", bitmap.width, equalTo(requestedWidth))
            assertDimensionApprox(
                "Aspect preserving height",
                bitmap.height,
                (fullHeight * (requestedWidth.toDouble() / fullWidth)).toInt(),
                tolerance = 3,
            )
            // Aspect ratio is preserved, so the content fills the bitmap without letterboxing.
            assertPixelIsGreen(bitmap, bitmap.width / 2, bitmap.height / 2)
            assertPixelIsGreen(bitmap, bitmap.width / 2, bitmap.height * 3 / 4)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageRecycleBitmap() {
        loadFullPage()

        sessionRule.display?.let {
            val first = sessionRule.waitForResult(it.captureFullPage())
            val second = sessionRule.waitForResult(it.screenshot().bitmap(first).captureFullPage())
            assertThat("Recycled bitmap is reused", second, sameInstance(first))
            assertThat("Recycled width is unchanged", second.width, equalTo(first.width))
            assertThat("Recycled height is unchanged", second.height, equalTo(first.height))
            assertPixelIsGreen(second, second.width / 2, second.height / 2)
            assertPixelIsGreen(second, second.width / 2, second.height * 3 / 4)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageReusesBuilder() {
        loadFullPage()

        sessionRule.display?.let {
            // The same builder must be safe to capture from twice: it should not mutate its own
            // fields on the first call in a way that corrupts the second.
            val builder = it.screenshot()
            val first = sessionRule.waitForResult(builder.captureFullPage())
            val second = sessionRule.waitForResult(builder.captureFullPage())
            assertThat("Repeated capture width matches", second.width, equalTo(first.width))
            assertThat("Repeated capture height matches", second.height, equalTo(first.height))
            assertPixelIsGreen(first, first.width / 2, first.height / 2)
            assertPixelIsGreen(second, second.width / 2, second.height / 2)
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test
    fun captureFullPageFailsWhenSessionClosed() {
        loadFullPage()

        sessionRule.display?.let { display ->
            // captureFullPage() is all-or-nothing: any failure (here, a closed session) must reject
            // with an exception rather than deliver a partial bitmap.
            mainSession.close()
            var exceptionListenerCalled = false
            val result = display.captureFullPage()
            result
                .exceptionally { error: Throwable ->
                    assertIs<IllegalStateException>(error)
                    exceptionListenerCalled = true
                    result
                }
                .accept {
                    fail("full page screenshot shouldn't complete successfully after session is closed")
                }
            UiThreadUtils.waitForCondition(
                { exceptionListenerCalled },
                sessionRule.env.defaultTimeoutMillis,
            )
        } ?: run { fail("no display found") }
    }

    @WithDisplay(height = SCREEN_HEIGHT, width = SCREEN_WIDTH)
    @Test(expected = IllegalStateException::class)
    fun captureFullPageFailsWithRecycledBitmap() {
        loadFullPage()

        sessionRule.display?.let {
            val recycled = createBitmap(SCREEN_WIDTH, SCREEN_HEIGHT, Bitmap.Config.ARGB_8888)
            recycled.recycle()
            // An unusable target bitmap must reject rather than deliver a partial bitmap.
            sessionRule.waitForResult(it.screenshot().bitmap(recycled).captureFullPage())
        } ?: run { fail("no display found") }
    }
}
