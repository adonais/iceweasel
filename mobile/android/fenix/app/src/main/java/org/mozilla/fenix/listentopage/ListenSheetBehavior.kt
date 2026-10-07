/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.listentopage

import android.view.Gravity
import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.children
import androidx.core.view.isVisible
import org.mozilla.fenix.R

/**
 * A [CoordinatorLayout.Behavior] that keeps the Listen Sheet clear of the toolbar.
 *
 * @param isAddressBarAtBottom Whether the address bar is at the bottom of the screen.
 */
internal class ListenSheetBehavior(isAddressBarAtBottom: Boolean) : CoordinatorLayout.Behavior<View>() {

    private val addressBarIds = listOf(R.id.toolbar, R.id.composable_toolbar)
    private val trackedIds =
        if (isAddressBarAtBottom) addressBarIds + R.id.navigation_bar else listOf(R.id.navigation_bar)

    private fun trackedChromes(parent: CoordinatorLayout): List<View> {
        return parent.children.filter { it.isVisible && it.id in trackedIds }.toList()
    }

    override fun layoutDependsOn(parent: CoordinatorLayout, child: View, dependency: View): Boolean =
        dependency.id in trackedIds

    override fun onLayoutChild(parent: CoordinatorLayout, child: View, layoutDirection: Int): Boolean {
        val params = child.layoutParams as? CoordinatorLayout.LayoutParams ?: return false
        val chromes = trackedChromes(parent)
        val inset = chromes.sumOf { it.height }

        params.gravity = Gravity.BOTTOM
        params.topMargin = 0
        params.bottomMargin = inset
        child.translationY = chromes.chromeOffset()

        // The margins are read by the default layout that follows, so it does not need taking over.
        return false
    }

    override fun onDependentViewChanged(parent: CoordinatorLayout, child: View, dependency: View): Boolean {
        val translationY = trackedChromes(parent).chromeOffset()

        if (child.translationY == translationY) {
            return false
        }

        child.translationY = translationY
        return true
    }

    /**
     * How far the ListenSheet follows the chrome down.
     *
     * Each piece of chrome is translated away independently, so the space vacated along the ListenSheet's edge is the
     * total of their translations. Once all of it is hidden this equals the inset, leaving the ListenSheet flush with
     * the edge.
     *
     * The clamp holds that last part true. A piece of chrome may translate further than its own height:
     * [org.mozilla.fenix.components.toolbar.NavbarToolbarSyncBehavior] moves the navigation bar by the *top* toolbar's
     * height, which with a simple top toolbar is the full toolbar height against a zero-height navigation bar. Without
     * the clamp that drives the ListenSheet below the bottom edge.
     */
    private fun List<View>.chromeOffset(): Float = map {
        it.translationY
    }
        .sum()
        .coerceIn(0f, sumOf { it.height }.toFloat())
}
