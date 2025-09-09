/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.recenttabs.controller

import androidx.navigation.NavController
import mozilla.components.feature.tabs.TabsUseCases.SelectTabUseCase
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.RecentTabs
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.home.HomeFragment
import org.mozilla.fenix.home.HomeFragmentDirections
import org.mozilla.fenix.home.recenttabs.RecentTab
import org.mozilla.fenix.home.recenttabs.interactor.RecentTabInteractor
import org.mozilla.fenix.utils.Settings

/**
 * An interface that handles the view manipulation of the recent tabs in the Home screen.
 */
interface RecentTabController {

    /**
     * @see [RecentTabInteractor.onRecentTabClicked]
     */
    fun handleRecentTabClicked(tabId: String)

    /**
     * @see [RecentTabInteractor.onRecentTabShowAllClicked]
     */
    fun handleRecentTabShowAllClicked()

    /**
     * @see [RecentTabInteractor.onRemoveRecentTab]
     */
    fun handleRecentTabRemoved(tab: RecentTab.Tab)
}

/**
 * The default implementation of [RecentTabController].
 *
 * @param selectTabUseCase [SelectTabUseCase] used selecting a tab.
 * @param navController [NavController] used for navigation.
 * @param appStore The [AppStore] that holds the state of the [HomeFragment].
 * @param settings [Settings] object used to obtain the tab manager feature flag.
 */
class DefaultRecentTabsController(
    private val selectTabUseCase: SelectTabUseCase,
    private val navController: NavController,
    private val appStore: AppStore,
    private val settings: Settings,
) : RecentTabController {

    override fun handleRecentTabClicked(tabId: String) {
        RecentTabs.recentTabOpened.record(NoExtras())

        selectTabUseCase.invoke(tabId)
        navController.navigate(R.id.browserFragment)
    }

    override fun handleRecentTabShowAllClicked() {
        RecentTabs.showAllClicked.record(NoExtras())
        if (settings.tabManagerEnhancementsEnabled) {
            navController.navigate(HomeFragmentDirections.actionGlobalTabManagementFragment())
        } else {
            navController.navigate(HomeFragmentDirections.actionGlobalTabsTrayFragment())
        }
    }

    override fun handleRecentTabRemoved(tab: RecentTab.Tab) {
        appStore.dispatch(AppAction.RemoveRecentTab(tab))
    }
}
