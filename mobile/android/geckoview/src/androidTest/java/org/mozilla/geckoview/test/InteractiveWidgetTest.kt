/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.view.inputmethod.InputMethodManager
import androidx.core.graphics.createBitmap
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.notNullValue
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.mozilla.geckoview.Autofill
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.ContentDelegate
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.PanZoomController
import org.mozilla.geckoview.ScreenLength
import org.mozilla.geckoview.test.rule.GeckoSessionTestRule
import org.mozilla.geckoview.test.rule.GeckoSessionTestRule.AssertCalled
import org.mozilla.geckoview.test.util.AssertUtils
import org.mozilla.geckoview.test.util.UiThreadUtils

@RunWith(AndroidJUnit4::class)
@MediumTest
class InteractiveWidgetTest : BaseSessionTest() {
    private val activityRule = ActivityScenarioRule(GeckoViewTestActivity::class.java)
    private val dynamicToolbarMaxHeight = 100
    private lateinit var imm: InputMethodManager
    private lateinit var view: GeckoView
    private var imeAnimations = 0

    @get:Rule override val rules: RuleChain = RuleChain.outerRule(activityRule).around(sessionRule)

    @Before
    fun setup() {
        activityRule.scenario.onActivity { activity ->
            // To make OnApplyWindowInsetsListener work for `interactive-widget` features
            // we need to setSession explicitly.
            activity.view.setSession(mainSession)
            activity.view.setDynamicToolbarMaxHeight(dynamicToolbarMaxHeight)
            imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            view = activity.view as GeckoView
            ViewCompat.setWindowInsetsAnimationCallback(view.rootView, imeAnimationTracker)
        }
    }

    @After
    fun cleanup() {
        try {
            activityRule.scenario.onActivity { activity ->
                ViewCompat.setWindowInsetsAnimationCallback(view.rootView, null)
                activity.view.releaseSession()
            }
        } catch (e: Exception) {}
    }

    private val imeAnimationTracker =
        object :
            WindowInsetsAnimationCompat.Callback(
                WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE
            ) {
            override fun onPrepare(animation: WindowInsetsAnimationCompat) {
                if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
                    imeAnimations++
                }
            }

            override fun onProgress(
                insets: WindowInsetsCompat,
                runningAnimations: MutableList<WindowInsetsAnimationCompat>,
            ): WindowInsetsCompat = insets

            override fun onEnd(animation: WindowInsetsAnimationCompat) {
                if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
                    imeAnimations = maxOf(0, imeAnimations - 1)
                }
            }
        }

    // Waits until the ime is shown or hidden and its insets animation has finished.
    private fun awaitIme(accepted: Boolean, visible: Boolean) {
        assertThat("IME request accepted", accepted, equalTo(true))
        UiThreadUtils.waitForCondition(
            {
                val imeVisible = ViewCompat.getRootWindowInsets(view)?.isVisible(WindowInsetsCompat.Type.ime()) ?: false
                imeVisible == visible && imeAnimations == 0
            },
            sessionRule.timeoutMillis,
        )
    }

    private fun showKeyboard() = awaitIme(imm.showSoftInput(view, 0), visible = true)

    private fun hideKeyboard() = awaitIme(imm.hideSoftInputFromWindow(view.windowToken, 0), visible = false)

    private fun hideDynamicToolbar() {
        val resized =
            mainSession.evaluatePromiseJS(
                """
                new Promise(resolve => {
                  window.addEventListener('resize', () => { resolve(true); }, { once: true });
                });
                """
                    .trimIndent()
            )
        mainSession.waitForRoundTrip()
        view.setVerticalClipping(-dynamicToolbarMaxHeight)
        assertThat("resize event", resized.value as Boolean, equalTo(true))
    }

    private fun ensureKeyboardOpen() {
        view.requestFocus()

        var promise =
            mainSession.evaluatePromiseJS(
                """
                new Promise(resolve => {
                  visualViewport.addEventListener('resize', () => {
                    resolve(true);
                  }, { once: true });
                });
                """
                    .trimIndent()
            )
        // Explicitly call `waitForRoundTrip()` to make sure the above event listener
        // has set up in the content.
        mainSession.waitForRoundTrip()

        // Open the software keyboard.
        showKeyboard()

        assertThat(
            "The visual viewport height should be changed in response to the the keyboard showing",
            promise.value as Boolean,
            equalTo(true),
        )
    }

    private fun surfaceHeight(): Double {
        val rect = Rect()
        mainSession.getSurfaceBounds(rect)
        return rect.height().toDouble()
    }

    /**
     * A white reference image [height] device pixels tall and as wide as the surface, with a [barColor] bar spanning
     * from [barTop] to [barBottom].
     */
    private fun createReferenceImage(
        height: Double,
        barTop: Double,
        barColor: Int,
        barBottom: Double = height,
    ): Bitmap {
        val rect = Rect()
        mainSession.getSurfaceBounds(rect)

        val bitmap = createBitmap(rect.width(), height.toInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint()
        paint.color = Color.rgb(255, 255, 255)
        canvas.drawRect(0f, 0f, rect.width().toFloat(), height.toFloat(), paint)

        paint.color = barColor
        canvas.drawRect(
            0f,
            barTop.toFloat(),
            rect.width().toFloat(),
            barBottom.toFloat(),
            paint,
        )
        return bitmap
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun fixedElementWithHalfVisibleDynamicToolbarOnResizesVisual() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.BUG2028072_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        ensureKeyboardOpen()

        // Bring the position:fixed element into the visual viewport.
        mainSession.evaluateJS("document.querySelector('#fixed').scrollIntoView()")
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        // Leave the dynamic toolbar half visible. The main thread doesn't move
        // position:fixed content until the toolbar is fully collapsed, so the
        // compositor has to shift it over the area the toolbar vacated.
        view.setVerticalClipping(-dynamicToolbarMaxHeight / 2)
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        val visualViewportHeight = mainSession.evaluateJS("window.visualViewport.height") as Double
        val fixedHeight =
            mainSession.evaluateJS("document.querySelector('#fixed').getBoundingClientRect().height") as Double
        val pixelRatio = mainSession.evaluateJS("window.devicePixelRatio") as Double

        // The fixed element is flush with the bottom of the area the
        // half-visible toolbar leaves, i.e. the visual viewport.
        val reference =
            createReferenceImage(
                surfaceHeight(),
                (visualViewportHeight - fixedHeight) * pixelRatio,
                Color.rgb(0, 0, 255),
                visualViewportHeight * pixelRatio,
            )

        val result = sessionRule.waitForResult(view.capturePixels())
        AssertUtils.assertScreenshotResult(result, reference)

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun fixedElementRectOnCollapsedToolbarWithKeyboardOnResizesVisual() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.INTERACTIVE_WIDGET_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        ensureKeyboardOpen()

        // Collapse the dynamic toolbar.
        hideDynamicToolbar()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        // With the dynamic toolbar collapsed the fixed viewport covers the area the
        // toolbar used to occupy, so a `bottom: 0` fixed element reaches the large
        // viewport height even though the software keyboard shrank the visual
        // viewport.
        val footerBottom =
            mainSession.evaluateJS("document.querySelector('.footer').getBoundingClientRect().bottom") as Double
        val largeViewportHeight =
            mainSession.evaluateJS("document.querySelector('.tall').getBoundingClientRect().height") as Double

        assertThat(
            "The position:fixed footer reaches the bottom of the large viewport",
            footerBottom,
            equalTo(largeViewportHeight),
        )

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun fixedElementWithDynamicToolbarOnResizesVisual() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.INTERACTIVE_WIDGET_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        ensureKeyboardOpen()

        hideDynamicToolbar()

        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        // Scroll the visual viewport to the bottom.
        mainSession.panZoomController.scrollTo(
            ScreenLength.zero(),
            ScreenLength.bottom(),
            PanZoomController.SCROLL_BEHAVIOR_AUTO,
        )
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        val height = mainSession.evaluateJS("window.visualViewport.height") as Double
        val pixelRatio = mainSession.evaluateJS("window.devicePixelRatio") as Double
        val reference =
            createReferenceImage(
                height * pixelRatio,
                height * pixelRatio - dynamicToolbarMaxHeight,
                Color.rgb(0, 128, 0),
            )

        val result = sessionRule.waitForResult(view.capturePixels())
        AssertUtils.assertScreenshotResult(result, reference)

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun fixedElementWithKeyboardOnResizesVisual() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.INTERACTIVE_WIDGET_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        hideDynamicToolbar()

        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        fun footerBottom(): Double =
            mainSession.evaluateJS("document.querySelector('.footer').getBoundingClientRect().bottom") as Double

        // The fixed viewport is expanded by the height of the hidden dynamic toolbar,
        // so the footer sits at the bottom of the large viewport.
        val bottomWithoutKeyboard = footerBottom()

        ensureKeyboardOpen()

        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        assertThat(
            "Showing the software keyboard doesn't move a position:fixed element on resizes-visual",
            footerBottom(),
            equalTo(bottomWithoutKeyboard),
        )

        // Scroll the visual viewport to the bottom so that the footer is the
        // bottom-most thing on the screen above the keyboard.
        mainSession.panZoomController.scrollTo(
            ScreenLength.zero(),
            ScreenLength.bottom(),
            PanZoomController.SCROLL_BEHAVIOR_AUTO,
        )
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        val height = mainSession.evaluateJS("window.visualViewport.height") as Double
        val pixelRatio = mainSession.evaluateJS("window.devicePixelRatio") as Double
        val reference =
            createReferenceImage(
                height * pixelRatio,
                height * pixelRatio - dynamicToolbarMaxHeight,
                Color.rgb(0, 128, 0),
            )

        val result = sessionRule.waitForResult(view.capturePixels())
        AssertUtils.assertScreenshotResult(result, reference)

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun overlaysContent() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.INTERACTIVE_WIDGET_OVERLAYS_CONTENT_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        view.requestFocus()

        // Open the software keyboard.
        showKeyboard()

        // Hide the dynamic toolbar.
        view.setVerticalClipping(-dynamicToolbarMaxHeight)

        // To make sure the dynamic toolbar height has been reflected into APZ.
        mainSession.flushApzRepaints()
        // Also to make sure the dynamic toolbar height has been reflected on the main-thread.
        mainSession.promiseAllPaintsDone()

        // Scroll the visual viewport to the bottom once.
        mainSession.panZoomController.scrollTo(
            ScreenLength.zero(),
            ScreenLength.bottom(),
            PanZoomController.SCROLL_BEHAVIOR_AUTO,
        )
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        // Then scroll up a bit.
        mainSession.panZoomController.scrollBy(
            ScreenLength.zero(),
            ScreenLength.fromPixels(-10.0),
            PanZoomController.SCROLL_BEHAVIOR_AUTO,
        )
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        val result = sessionRule.waitForResult(view.capturePixels())

        // On overlays-content mode neither the visual viewport nor the layout viewport is changed,
        // thus there's no way to tell the visible area while the software keyboard is shown.
        val reference =
            createReferenceImage(
                result.height.toDouble(),
                0.0,
                Color.rgb(0, 128, 0),
            )

        AssertUtils.assertScreenshotResult(result, reference)

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun hideDynamicToolbarOnResizesVisual() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.HIDE_DYNAMIC_TOOLBAR_ON_RESIZES_VISUAL_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        ensureKeyboardOpen()

        mainSession.evaluateJS("document.getElementById('input1').focus();")
        mainSession.zoomToFocusedInput()

        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        mainSession.waitUntilCalled(
            object : ContentDelegate {
                @AssertCalled(count = 1) override fun onHideDynamicToolbar(session: GeckoSession) {}
            }
        )

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun bug1994311() {
        mainSession.setActive(true)
        sessionRule.display?.run { setDynamicToolbarMaxHeight(0) }

        mainSession.loadTestPath(BaseSessionTest.BUG1994311_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        val viewportHeight = mainSession.evaluateJS("window.visualViewport.height") as Double

        // Open the software keyboard.
        ensureKeyboardOpen()

        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        // Scroll down visually.
        mainSession.panZoomController.scrollBy(
            ScreenLength.zero(),
            ScreenLength.fromPixels(viewportHeight),
            PanZoomController.SCROLL_BEHAVIOR_AUTO,
        )

        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        var scrollY = mainSession.evaluateJS("window.scrollY") as Double

        // Now the layout scroll offset is different from the visual scroll offset.
        assertThat(
            "The layout scroll offset hasn't reached the destination",
            scrollY,
            not(equalTo(viewportHeight)),
        )

        var resizeEventPromise =
            mainSession.evaluatePromiseJS(
                """
                new Promise(resolve => {
                  visualViewport.addEventListener('resize', () => {
                    resolve(true);
                  }, { once: true });
                });
                """
                    .trimIndent()
            )
        // Explicitly call `waitForRoundTrip()` to make sure the above event listener
        // has set up in the content.
        mainSession.waitForRoundTrip()

        // Dismiss the software keyboard.
        hideKeyboard()

        assertThat(
            "The visual viewport height should be changed",
            resizeEventPromise.value as Boolean,
            equalTo(true),
        )

        val currentViewportHeight = mainSession.evaluateJS("window.visualViewport.height") as Double
        assertThat(
            "The visual viewport height is restored to the original one",
            currentViewportHeight,
            equalTo(viewportHeight),
        )

        // Dismissing the software keyboard changes the root composition size,
        // and the new composition size is propagated to APZ and the root
        // content APZC notifies to the main-thread that there's a pending visual
        // scroll offset change which needs to be reflected to the main-thread.
        // Because of this round trip of the information we need to wait for it.
        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        scrollY = mainSession.evaluateJS("window.scrollY") as Double

        assertThat(
            "Now the layout scroll offset is equal to the visual scroll destination",
            scrollY,
            equalTo(viewportHeight),
        )
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun bug1993407() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.BUG1993407_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        val caretRect =
            mainSession.evaluateJS(
                """
                const inputRect = document.querySelector('input').getBoundingClientRect();
                document.caretPositionFromPoint(0, inputRect.y)?.getClientRect();
                """
                    .trimIndent()
            )
        assertThat("The caretRect should not be null", caretRect, notNullValue())

        val caretRectObject = caretRect as JSONObject
        val caretY = caretRectObject.getDouble("y")
        val caretHeight = caretRectObject.getDouble("height")
        val caretBottom = caretRectObject.getDouble("bottom")

        // Open the software keyboard.
        ensureKeyboardOpen()

        mainSession.evaluateJS("document.querySelector('input').focus();")
        mainSession.zoomToFocusedInput()

        mainSession.flushApzRepaints()
        mainSession.promiseAllPaintsDone()

        val scrollY = mainSession.evaluateJS("window.scrollY") as Double
        val offsetTop = mainSession.evaluateJS("window.visualViewport.offsetTop") as Double
        val pageTop = mainSession.evaluateJS("window.visualViewport.pageTop") as Double
        val visualViewportHeight = mainSession.evaluateJS("window.visualViewport.height") as Double

        assertThat(
            "The offsetTop and pageTop of visual viewport is not diverged",
            offsetTop,
            equalTo(pageTop),
        )
        assertThat("The offsetTop is not 0", offsetTop, not(equalTo(0.0)))
        assertThat("The offsetTop is ", offsetTop, equalTo(caretBottom - visualViewportHeight))

        assertThat(
            "The layout scroll offset stays at 0",
            scrollY,
            equalTo(0.0),
        )

        // Close the software keyboard.
        hideKeyboard()
    }

    @GeckoSessionTestRule.NullDelegate(Autofill.Delegate::class)
    @Test
    fun scrollIntoViewToPositionFixed() {
        mainSession.setActive(true)

        mainSession.loadTestPath(BaseSessionTest.BUG2028072_HTML_PATH)
        mainSession.waitForPageStop()
        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        ensureKeyboardOpen()

        hideDynamicToolbar()

        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        mainSession.evaluateJS("document.querySelector('#fixed').scrollIntoView()")

        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        val scrollY = mainSession.evaluateJS("window.scrollY") as Double
        val pageTop = mainSession.evaluateJS("window.visualViewport.pageTop") as Double

        mainSession.evaluateJS("document.querySelector('#fixed').scrollIntoView()")

        mainSession.promiseAllPaintsDone()
        mainSession.flushApzRepaints()

        assertThat(
            "scrollIntoView should not change the layout scroll position when the target is already in the visual viewport",
            mainSession.evaluateJS("window.scrollY") as Double,
            equalTo(scrollY),
        )
        assertThat(
            "scrollIntoView should not change the visual scroll position when the target is already in the visual viewport",
            mainSession.evaluateJS("window.visualViewport.pageTop") as Double,
            equalTo(pageTop),
        )

        // Close the software keyboard.
        hideKeyboard()
    }
}
