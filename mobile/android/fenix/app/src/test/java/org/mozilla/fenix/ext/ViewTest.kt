/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import android.graphics.Rect
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import androidx.core.view.WindowInsetsCompat
import io.mockk.MockKAnnotations
import io.mockk.Runs
import io.mockk.every
import io.mockk.impl.annotations.MockK
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ViewTest {

    @MockK(relaxed = true) private lateinit var view: View

    @MockK(relaxed = true) private lateinit var parent: FrameLayout

    @Before
    fun setup() {
        MockKAnnotations.init(this)

        every { view.context } answers { testContext }
        every { view.resources.getDimensionPixelSize(any()) } answers {
            testContext.resources.getDimensionPixelSize(firstArg())
        }
        every { view.parent } returns parent
        every { parent.touchDelegate = any() } just Runs
        every { parent.post(any()) } answers {
            // Immediately run the given Runnable argument
            val action: Runnable = firstArg()
            action.run()
            true
        }
    }

    @Test
    fun `test increase touch area`() {
        val hitRect = Rect(30, 40, 50, 60)
        val px = 20
        val outRect = slot<Rect>()
        every { view.getHitRect(capture(outRect)) } answers { outRect.captured.set(hitRect) }

        view.increaseTapAreaInternal(px)

        val expected = Rect(10, 20, 70, 80)
        assertEquals(expected.left, outRect.captured.left)
        assertEquals(expected.top, outRect.captured.top)
        assertEquals(expected.right, outRect.captured.right)
        assertEquals(expected.bottom, outRect.captured.bottom)
        verify { parent.touchDelegate = any() }
    }

    @Test
    fun `test remove touch delegate`() {
        view.removeTouchDelegate()
        verify { parent.touchDelegate = null }
    }

    @Test
    fun `getWindowInsets returns null when the system insets don't exist`() {
        every { view.rootWindowInsets } returns null
        assertEquals(null, view.getWindowInsets())
    }

    @Test
    fun `getWindowInsets returns the compat insets when the system insets exist`() {
        val rootInsets: WindowInsets = mockk(relaxed = true)
        every { view.rootWindowInsets } returns rootInsets

        // Construct the expected object directly instead of mocking the static method
        val expectedInsets = WindowInsetsCompat.toWindowInsetsCompat(rootInsets)
        assertEquals(expectedInsets, view.getWindowInsets())
    }

    @Test
    fun `getKeyboardHeight accounts for status bar and navigation bar`() {
        val result = getKeyboardHeight(
            rootViewHeight = 1000,
            windowVisibleDisplayFrame = Rect(0, 50, 1000, 500),
            bottomInset = 50,
        )

        assertEquals(450, result)
    }

    @Test
    fun `isKeyboardVisible returns false when the keyboard height is 0`() {
        assertFalse(isKeyboardVisible(keyboardHeight = 0))
    }

    @Test
    fun `isKeyboardVisible returns true when the keyboard height is greater than 0`() {
        // Test the pure logic directly
        assertTrue(isKeyboardVisible(keyboardHeight = 100))
    }

    @Test
    fun `getRectWithScreenLocation should transform getLocationInScreen method values`() {
        val locationOnScreen = slot<IntArray>()
        every { view.getLocationOnScreen(capture(locationOnScreen)) } answers {
            locationOnScreen.captured[0] = 100
            locationOnScreen.captured[1] = 200
        }
        every { view.width } returns 150
        every { view.height } returns 250

        val outRect = view.getRectWithScreenLocation()

        assertEquals(100, outRect.left)
        assertEquals(200, outRect.top)
        assertEquals(250, outRect.right)
        assertEquals(450, outRect.bottom)
    }

    @Test
    fun `getKeyboardHeight returns the keyboard height when keyboard is considered open`() {
        // Test the pure calculation logic directly
        val result = getKeyboardHeight(
            rootViewHeight = 1500,
            windowVisibleDisplayFrame = Rect(0, 0, 500, 1000),
            bottomInset = 0,
        )
        assertEquals(500, result)
    }

    @Test
    fun `getKeyboardHeight returns zero when keyboard is considered closed`() {
        // Test the pure calculation logic directly
        val result = getKeyboardHeight(
            rootViewHeight = 1000,
            windowVisibleDisplayFrame = Rect(0, 0, 500, 1000),
            bottomInset = 0,
        )
        assertEquals(0, result)
    }
}
