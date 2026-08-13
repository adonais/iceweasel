/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.navigation.compat

import android.content.Context
import android.provider.Settings
import androidx.fragment.app.FragmentManager
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavOptions
import androidx.navigation.Navigator
import androidx.navigation.fragment.FragmentNavigator

/**
 * A [FragmentNavigator] that strips navigation transition animations when the user has
 * enabled reduced-motion accessibility settings on their device.
 *
 * When either [Settings.Global.TRANSITION_ANIMATION_SCALE] or
 * [Settings.Global.ANIMATOR_DURATION_SCALE] is set to 0, all enter/exit/popEnter/popExit
 * animations are removed from the [NavOptions] before delegating to the default
 * [FragmentNavigator.navigate].
 *
 * @param context used to query the system animation scale settings.
 * @param fragmentManager the [FragmentManager] for performing fragment transactions.
 * @param containerId the resource id of the container in which fragments are hosted.
 */
@Navigator.Name("fragment")
class MotionAwareFragmentNavigator(
    private val context: Context,
    fragmentManager: FragmentManager,
    containerId: Int,
) : FragmentNavigator(context, fragmentManager, containerId) {

    override fun navigate(
        entries: List<NavBackStackEntry>,
        navOptions: NavOptions?,
        navigatorExtras: Navigator.Extras?,
    ) {
        val finalNavOptions = if (context.reducedMotionActive) {
            // rebuild the NavOptions while stripping all animation entries
            navOptions?.let {
                NavOptions.Builder()
                    .setLaunchSingleTop(it.shouldLaunchSingleTop())
                    .setRestoreState(it.shouldRestoreState())
                    .setPopUpTo(it.popUpToId, it.isPopUpToInclusive(), it.shouldPopUpToSaveState())
                    .build()
            }
        } else {
            navOptions
        }

        super.navigate(entries, finalNavOptions, navigatorExtras)
    }

    /**
     * Whether the user has disabled animations via system accessibility settings.
     * Returns `true` when either the transition or animator duration scale is set to 0.
     */
    private val Context.reducedMotionActive: Boolean
        get() {
            val contentResolver = contentResolver ?: return false
            val transitionScale = Settings.Global.getFloat(
                contentResolver,
                Settings.Global.TRANSITION_ANIMATION_SCALE,
                1.0f,
            )

            if (transitionScale == 0f) return true

            val animatorScale = Settings.Global.getFloat(
                contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1.0f,
            )

            return animatorScale == 0f
        }
}
