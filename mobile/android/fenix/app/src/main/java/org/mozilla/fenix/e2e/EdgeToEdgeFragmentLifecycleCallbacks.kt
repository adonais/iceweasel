/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.e2e

import android.os.Build.VERSION.SDK_INT
import android.os.Build.VERSION_CODES
import android.os.Bundle
import android.view.View
import androidx.core.view.doOnPreDraw
import androidx.fragment.app.DialogFragment
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks
import androidx.navigation.fragment.NavHostFragment
import mozilla.components.support.ktx.android.view.clearPersistentInsets
import mozilla.components.support.ktx.android.view.setupPersistentInsets

/**
 * [FragmentLifecycleCallbacks] delegate for configuring the container activity
 * as edge-to-edge or not to match how the new fragment navigated to is wants to be displayed.
 */
class EdgeToEdgeFragmentLifecycleCallbacks : FragmentLifecycleCallbacks() {

    override fun onFragmentViewCreated(
        fm: FragmentManager,
        f: Fragment,
        v: View,
        savedInstanceState: Bundle?,
    ) {
        // Dialog fragments have their own edge-to-edge behavior, separate from Fenix's main activity.
        if (f is DialogFragment) return

        // This Jetpack Navigation specialized fragment acts as a container for application's own fragments
        // and only the later set different edge-to-edge handling strategies.
        if (f is NavHostFragment) return

        f.requireActivity().window.apply {
            // Change the edge-to-edge behavior right before the new fragment is about to be drawn
            // to prevent the previous one with a different strategy "jumping".
            v.doOnPreDraw {
                when (f is SystemInsetsPaddedFragment) {
                    true -> setupPersistentInsets()
                    else -> clearPersistentInsets()
                }
            }
        }
    }

    companion object {
        /**
         * Register this functionality to observe all fragment navigations in [supportFragmentManager]
         * and configure the parent activity with a new edge-to-edge behavior depending on the current fragment.
         * This only works on if API33+.
         *
         * @param supportFragmentManager [FragmentManager] hosting all screens for which to set
         * a different edge-to-edge behavior.
         */
        fun register(supportFragmentManager: FragmentManager) {
            // Matching the same API guard used for the methods controlling the edge-to-edge insets.
            if (SDK_INT < VERSION_CODES.TIRAMISU) return

            val callbacks = EdgeToEdgeFragmentLifecycleCallbacks()

            // Applying this recursively is needed because
            // NavHostFragment adds additional fragments as subfragments.
            supportFragmentManager.registerFragmentLifecycleCallbacks(callbacks, true)
        }
    }
}
