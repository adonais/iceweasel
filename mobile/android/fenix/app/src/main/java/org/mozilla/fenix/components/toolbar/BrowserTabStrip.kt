/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.content.Context
import android.view.Gravity
import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams
import androidx.core.view.isVisible
import org.mozilla.fenix.R
import org.mozilla.fenix.utils.Settings

/**
 * A wrapper over the `TabStrip` composable that provides enhanced customization and lifecycle-aware integration in an
 * XML layout.
 *
 * @param context Android [Context] used for system interactions.
 * @param container [ViewGroup] which will serve as parent of this View.
 * @param settings [Settings] object for the current application setup.
 * @param content Composable content for the tab strip.
 */
class BrowserTabStrip(
    context: Context,
    private val container: ViewGroup,
    private val settings: Settings,
    private val content: @Composable () -> Unit,
) {
    val layout =
        BrowserTabStripView(context) {
                content()
            }
            .apply {
                id = R.id.tabstrip
                addToParent()
                setDynamicBehavior()
            }

    internal fun gone() {
        layout.isVisible = false
    }

    internal fun visible() {
        layout.isVisible = true
    }

    private fun BrowserTabStripView.addToParent() {
        container.addView(
            this,
            LayoutParams(
                    LayoutParams.MATCH_PARENT,
                    LayoutParams.WRAP_CONTENT,
                )
                .apply {
                    gravity = Gravity.TOP
                },
        )
    }

    private fun BrowserTabStripView.setDynamicBehavior() {
        if (settings.isDynamicToolbarEnabled) {
            (layoutParams as LayoutParams).apply {
                behavior = NavbarToolbarSyncBehavior(context)
            }
        }
    }
}
