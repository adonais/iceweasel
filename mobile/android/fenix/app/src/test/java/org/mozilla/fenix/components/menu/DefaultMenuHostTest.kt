/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import androidx.navigation.NavController
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.optionsEq

@RunWith(AndroidJUnit4::class)
class DefaultMenuHostTest {
    private val navController = navControllerShowing(R.id.menuFragment)
    private val host = DefaultMenuHost(navController)

    @Test
    fun `WHEN closing the menu THEN remove it from the back stack`() {
        host.dismiss()

        verify { navController.popBackStack(R.id.menuFragment, true) }
    }

    @Test
    fun `WHEN navigating away from the menu THEN show the screen navigated to in place of the menu`() {
        val directions = NavGraphDirections.actionGlobalTabHistoryDialogFragment(activeSessionId = null)

        host.navigate(directions)

        verify { navController.navigate(directions, optionsEq(replacingTheMenu)) }
    }

    @Test
    fun `GIVEN the menu is not shown anymore WHEN navigating away from it THEN don't navigate`() {
        val navController = navControllerShowing(R.id.browserFragment)

        DefaultMenuHost(navController).navigate(NavGraphDirections.actionGlobalSettingsFragment())

        verify(exactly = 0) { navController.navigate(any<NavDirections>(), any<NavOptions>()) }
    }

    private fun navControllerShowing(destinationId: Int): NavController =
        mockk(relaxed = true) { every { currentDestination } returns mockk { every { id } returns destinationId } }

    private companion object {
        val replacingTheMenu: NavOptions = NavOptions.Builder().setPopUpTo(R.id.menuFragment, true).build()
    }
}
