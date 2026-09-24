/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

import android.view.Gravity
import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.isVisible
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private const val CHROME_HEIGHT = 100
private const val NAV_BAR_HEIGHT = 60

@RunWith(RobolectricTestRunner::class)
class PdfOverlayBehaviorTest {
    private val container = CoordinatorLayout(ApplicationProvider.getApplicationContext())

    private val tools =
        View(container.context).apply {
            layoutParams =
                CoordinatorLayout.LayoutParams(
                    CoordinatorLayout.LayoutParams.MATCH_PARENT,
                    CoordinatorLayout.LayoutParams.WRAP_CONTENT,
                )
        }

    private val layoutParams: CoordinatorLayout.LayoutParams
        get() = tools.layoutParams as CoordinatorLayout.LayoutParams

    private fun addChrome(id: Int, height: Int = CHROME_HEIGHT, isVisible: Boolean = true): View =
        View(container.context).apply {
            this.id = id
            this.isVisible = isVisible
            container.addView(this)
            // Robolectric does not lay out the container, so the height is applied directly.
            layout(0, 0, 500, height)
        }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with the address bar at the bottom WHEN the overlays are laid out THEN both are inset from the bottom chrome`() {
        addChrome(R.id.navigation_bar)

        pdfToolsBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.BOTTOM, layoutParams.gravity)
        assertEquals(CHROME_HEIGHT, layoutParams.bottomMargin)
        assertEquals(0, layoutParams.topMargin)

        signatureDialogBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.BOTTOM, layoutParams.gravity)
        assertEquals(CHROME_HEIGHT, layoutParams.bottomMargin)
    }

    @Test
    @Config(qualifiers = "sw800dp")
    fun `GIVEN a tablet window with the address bar at the top WHEN the overlays are laid out THEN they take opposite edges`() {
        // Test for Bug 2067261
        addChrome(R.id.composable_toolbar)
        addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)

        pdfToolsBehavior(isAddressBarAtBottom = false).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.TOP, layoutParams.gravity)
        assertEquals(CHROME_HEIGHT, layoutParams.topMargin)
        assertEquals(0, layoutParams.bottomMargin)

        signatureDialogBehavior(isAddressBarAtBottom = false).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.BOTTOM, layoutParams.gravity)
        assertEquals(NAV_BAR_HEIGHT, layoutParams.bottomMargin)
        assertEquals(0, layoutParams.topMargin)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with the address bar and navigation bar both at the bottom WHEN the tools are laid out THEN the inset covers both`() {
        addChrome(R.id.composable_toolbar)
        addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)

        pdfToolsBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(CHROME_HEIGHT + NAV_BAR_HEIGHT, layoutParams.bottomMargin)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with the address bar at the top WHEN the tools are laid out THEN only the navigation bar insets them`() {
        addChrome(R.id.composable_toolbar)
        addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)

        pdfToolsBehavior(isAddressBarAtBottom = false).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(NAV_BAR_HEIGHT, layoutParams.bottomMargin)
    }

    @Test
    @Config(qualifiers = "sw800dp")
    fun `GIVEN a tablet window with the address bar at the bottom WHEN the overlays are laid out THEN only the dialog is inset`() {
        addChrome(R.id.composable_toolbar)
        addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)

        pdfToolsBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.TOP, layoutParams.gravity)
        assertEquals(0, layoutParams.topMargin)

        signatureDialogBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(Gravity.BOTTOM, layoutParams.gravity)
        assertEquals(CHROME_HEIGHT + NAV_BAR_HEIGHT, layoutParams.bottomMargin)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with hidden bottom chrome WHEN the tools are laid out THEN they are not inset from it`() {
        addChrome(R.id.navigation_bar, isVisible = false)

        pdfToolsBehavior(isAddressBarAtBottom = true).onLayoutChild(container, tools, View.LAYOUT_DIRECTION_LTR)

        assertEquals(0, layoutParams.bottomMargin)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with the address bar at the bottom WHEN asked about a view off the tools edge THEN the layout does not depend on it`() {
        val navBar = addChrome(R.id.navigation_bar)
        val unrelated = addChrome(R.id.findInPageView)

        val behavior = pdfToolsBehavior(isAddressBarAtBottom = true)

        assertTrue(behavior.layoutDependsOn(container, tools, navBar))
        assertFalse(behavior.layoutDependsOn(container, tools, unrelated))
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with the address bar at the bottom WHEN the tracked chrome is scrolled away THEN the tools follow it`() {
        val navBar = addChrome(R.id.navigation_bar)
        navBar.translationY = 40f

        val behavior = pdfToolsBehavior(isAddressBarAtBottom = true)

        assertTrue(behavior.onDependentViewChanged(container, tools, navBar))
        assertEquals(40f, tools.translationY, 0f)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN a phone window with two pieces of tracked chrome WHEN they are scrolled away THEN the tools follow the total offset`() {
        val addressBar = addChrome(R.id.composable_toolbar)
        val navBar = addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)
        addressBar.translationY = CHROME_HEIGHT.toFloat()
        navBar.translationY = NAV_BAR_HEIGHT.toFloat()

        val behavior = pdfToolsBehavior(isAddressBarAtBottom = true)
        behavior.onDependentViewChanged(container, tools, navBar)

        // The tools end up flush with the edge, having moved by the whole inset.
        assertEquals((CHROME_HEIGHT + NAV_BAR_HEIGHT).toFloat(), tools.translationY, 0f)
    }

    @Test
    @Config(qualifiers = "sw400dp")
    fun `GIVEN the tools already match the tracked chrome WHEN it changes THEN no change is reported`() {
        val navBar = addChrome(R.id.navigation_bar)
        navBar.translationY = 40f
        tools.translationY = 40f

        assertFalse(pdfToolsBehavior(isAddressBarAtBottom = true).onDependentViewChanged(container, tools, navBar))
    }

    @Test
    @Config(qualifiers = "sw800dp")
    fun `GIVEN a tablet window showing the signature dialog WHEN asked about the top address bar THEN the layout does not depend on it`() {
        val addressBar = addChrome(R.id.composable_toolbar)
        val navBar = addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)

        val behavior = signatureDialogBehavior(isAddressBarAtBottom = false)

        assertTrue(behavior.layoutDependsOn(container, tools, navBar))
        assertFalse(behavior.layoutDependsOn(container, tools, addressBar))
    }

    @Test
    @Config(qualifiers = "sw800dp")
    fun `GIVEN a tablet window showing the signature dialog WHEN the bottom chrome is scrolled away THEN the dialog follows it`() {
        addChrome(R.id.composable_toolbar)
        val navBar = addChrome(R.id.navigation_bar, height = NAV_BAR_HEIGHT)
        navBar.translationY = NAV_BAR_HEIGHT.toFloat()

        val behavior = signatureDialogBehavior(isAddressBarAtBottom = false)

        assertTrue(behavior.onDependentViewChanged(container, tools, navBar))
        assertEquals(NAV_BAR_HEIGHT.toFloat(), tools.translationY, 0f)
    }
}
