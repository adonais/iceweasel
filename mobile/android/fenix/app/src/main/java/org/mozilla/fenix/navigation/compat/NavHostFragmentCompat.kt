/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.navigation.compat

import androidx.navigation.NavHostController
import androidx.navigation.fragment.NavHostFragment

/**
 * Compat [NavHostFragment] for use with our navigation graph.
 *
 * This class exists as a solution to https://bugzilla.mozilla.org/show_bug.cgi?id=1812063 where our app
 * was not respecting the system settings for screens where we define a navigation animation in the nav_graph.xml
 */
class NavHostFragmentCompat : NavHostFragment() {

    override fun onCreateNavHostController(navHostController: NavHostController) {
        super.onCreateNavHostController(navHostController)
        navHostController.navigatorProvider.addNavigator(
            MotionAwareFragmentNavigator(
                context = requireContext(),
                fragmentManager = childFragmentManager,
                containerId = id,
            ),
        )
    }
}
