/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.content.Context
import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.isVisible
import kotlin.math.roundToInt
import org.mozilla.fenix.R

/**
 * A [CoordinatorLayout.Behavior] implementation that synchronizes the navbar's y-translation with the top toolbar. This
 * ensures that when the top toolbar scrolls, the navbar at the bottom follows the same translation behavior.
 *
 * @param context [Context] needed for behavior initialization.
 */
class NavbarToolbarSyncBehavior(context: Context) : CoordinatorLayout.Behavior<View>(context, null) {
    // This ensures that the top and bottom bars are translated up/down in sync
    // and prevents the scenario in which one being taller completely hides the other one
    // long before it being hidden.
    private var childVsDependencyHeightRatio: Float = 1f

    override fun layoutDependsOn(
        parent: CoordinatorLayout,
        child: View,
        dependency: View,
    ): Boolean {
        return dependency.id == R.id.composable_toolbar
    }

    override fun onDependentViewChanged(
        parent: CoordinatorLayout,
        child: View,
        dependency: View,
    ): Boolean {
        if (!child.isVisible || dependency.translationY.isNaN()) {
            return false
        }

        if (child.height > 0 && dependency.height > 0) {
            childVsDependencyHeightRatio = (child.height.toFloat() / dependency.height)
        }

        child.translationY = (-dependency.translationY * childVsDependencyHeightRatio).roundToInt().toFloat()

        return true
    }
}
