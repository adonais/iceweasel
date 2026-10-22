/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import androidx.navigation.NavController
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.nav

/** Collection of menu related operations. */
interface MenuHost {
    /** Close the menu. */
    fun dismiss()

    /** Close the menu and opens the screen [directions] lead to. */
    fun navigate(directions: NavDirections)
}

/**
 * Default handling of the menu related operations.
 *
 * @param navController [NavController] for closing the menu or navigating away from it.
 */
internal class DefaultMenuHost(private val navController: NavController) : MenuHost {
    override fun dismiss() {
        navController.popBackStack(R.id.menuFragment, true)
    }

    override fun navigate(directions: NavDirections) {
        navController.nav(
            id = R.id.menuFragment,
            directions = directions,
            navOptions = NavOptions.Builder().setPopUpTo(R.id.menuFragment, true).build(),
        )
    }
}
