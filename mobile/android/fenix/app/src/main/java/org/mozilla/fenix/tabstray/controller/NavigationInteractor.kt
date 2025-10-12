/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.controller

import androidx.navigation.NavController
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.TabsTray
import org.mozilla.fenix.components.accounts.FenixFxAEntryPoint
import org.mozilla.fenix.home.HomeScreenViewModel.Companion.ALL_NORMAL_TABS
import org.mozilla.fenix.home.HomeScreenViewModel.Companion.ALL_PRIVATE_TABS
import org.mozilla.fenix.tabstray.ext.isActiveDownload
import org.mozilla.fenix.tabstray.ui.TabManagementFragmentDirections

/**
 * An interactor that helps with navigating to different parts of the app from the tab manager.
 */
interface NavigationInteractor {

    /**
     * Called when tab manager should be dismissed.
     */
    fun onTabManagerDismissed()

    /**
     * Called when clicking the account settings button.
     */
    fun onAccountSettingsClicked()

    /**
     * Called when clicking the tab settings button.
     */
    fun onTabSettingsClicked()

    /**
     * Called when clicking the close all tabs button.
     */
    fun onCloseAllTabsClicked(private: Boolean)

    /**
     * Called when cancelling private downloads confirmed.
     */
    fun onCloseAllPrivateTabsWarningConfirmed(private: Boolean)

    /**
     * Called when opening the recently closed tabs menu button.
     */
    fun onOpenRecentlyClosedClicked()
}

/**
 * A default implementation of [NavigationInteractor].
 *
 * This is slated to get refactored in:
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1977667
 */
class DefaultNavigationInteractor(
    private val browserStore: BrowserStore,
    private val navController: NavController,
    private val dismissTabManagerAndNavigateHome: (sessionId: String) -> Unit,
    private val showCancelledDownloadWarning: (downloadCount: Int, tabId: String?, source: String?) -> Unit,
    private val accountManager: FxaAccountManager,
) : NavigationInteractor {

    override fun onTabManagerDismissed() {
        TabsTray.closed.record(NoExtras())
    }

    override fun onAccountSettingsClicked() {
        val isSignedIn = accountManager.authenticatedAccount() != null

        val direction = if (isSignedIn) {
            TabManagementFragmentDirections.actionGlobalAccountSettingsFragment()
        } else {
            TabManagementFragmentDirections.actionGlobalTurnOnSync(
                entrypoint = FenixFxAEntryPoint.NavigationInteraction,
            )
        }
        navController.navigate(direction)
    }

    override fun onTabSettingsClicked() {
        navController.navigate(
            TabManagementFragmentDirections.actionGlobalTabSettingsFragment(),
        )
    }

    override fun onOpenRecentlyClosedClicked() {
        navController.navigate(
            TabManagementFragmentDirections.actionGlobalRecentlyClosed(),
        )
        Events.recentlyClosedTabsOpened.record(NoExtras())
    }

    override fun onCloseAllTabsClicked(private: Boolean) {
        closeAllTabs(private, isConfirmed = false)
    }

    override fun onCloseAllPrivateTabsWarningConfirmed(private: Boolean) {
        closeAllTabs(private, isConfirmed = true)
    }

    private fun closeAllTabs(private: Boolean, isConfirmed: Boolean) {
        val sessionsToClose = if (private) {
            ALL_PRIVATE_TABS
        } else {
            ALL_NORMAL_TABS
        }

        if (private && !isConfirmed) {
            val privateDownloads = browserStore.state.downloads.filter {
                it.value.private && it.value.isActiveDownload()
            }
            if (privateDownloads.isNotEmpty()) {
                showCancelledDownloadWarning(privateDownloads.size, null, null)
                return
            }
        }
        dismissTabManagerAndNavigateHome(sessionsToClose)
    }
}
