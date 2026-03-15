/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import android.content.Context
import androidx.navigation.NavOptions
import org.mozilla.fenix.R
import org.mozilla.fenix.components.toolbar.ToolbarPosition
import org.mozilla.fenix.ext.settings

/**
 * A helper class for providing the appropriate nav option animations based on toolbar
 * characteristics.
 */
object ToolbarNavOptionsHelper {

    /**
     * Returns the [NavOptions] to be used when navigating based on the provided
     * [org.mozilla.fenix.components.toolbar.ToolbarPosition].
     */
    fun getToolbarNavOptions(context: Context): NavOptions {
        return getToolbarNavOptions(context.settings().toolbarPosition)
    }

    /**
     * Returns the [NavOptions] to be used when navigating based on the provided
     * [org.mozilla.fenix.components.toolbar.ToolbarPosition].
     */
    fun getToolbarNavOptions(toolbarPosition: ToolbarPosition): NavOptions {
        val navOptions = NavOptions.Builder()

        when (toolbarPosition) {
            ToolbarPosition.TOP -> {
                navOptions.setEnterAnim(R.anim.fade_in)
                navOptions.setExitAnim(R.anim.fade_out)
            }

            ToolbarPosition.BOTTOM -> {
                navOptions.setEnterAnim(R.anim.fade_in_up)
                navOptions.setExitAnim(R.anim.fade_out_down)
            }
        }

        return navOptions.build()
    }
}
