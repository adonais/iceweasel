/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home

import androidx.navigation.NavController
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R

/**
 * Navigates back from the homepage shown as a tab.
 *
 * Back navigation follows the selected tab's own history, which may include a homepage.
 *
 * @param browserStore [BrowserStore] to read the selected tab's history from and to navigate back in.
 * @param navController [NavController] used to leave the homepage destination.
 * @return `true` if the back navigation was handled, `false` if there is nothing to go back to.
 */
internal fun goBackFromHomepage(
    browserStore: BrowserStore,
    navController: NavController,
): Boolean {
    val tab = browserStore.state.selectedTab ?: return false

    if (tab.content.canGoBack) {
        browserStore.dispatch(EngineAction.GoBackAction(tab.id))

        val history = tab.content.history
        if (history.items.getOrNull(history.currentIndex - 1)?.uri != ABOUT_HOME_URL) {
            navigateFromHomeFragmentToBrowserFragment(navController)
        }

        return true
    }

    return false
}

internal fun goForwardFromHomepage(
    browserStore: BrowserStore,
    navController: NavController,
): Boolean {
    val tab = browserStore.state.selectedTab ?: return false

    if (tab.content.canGoForward) {
        browserStore.dispatch(EngineAction.GoForwardAction(tab.id))

        val history = tab.content.history
        if (history.items.getOrNull(history.currentIndex + 1)?.uri != ABOUT_HOME_URL) {
            navigateFromHomeFragmentToBrowserFragment(navController)
        }

        return true
    }

    return false
}

internal fun navigateFromHomeFragmentToBrowserFragment(navController: NavController) {
    if (navController.currentDestination?.id == R.id.homeFragment) {
        navController.navigate(NavGraphDirections.actionGlobalBrowser())
    }
}
