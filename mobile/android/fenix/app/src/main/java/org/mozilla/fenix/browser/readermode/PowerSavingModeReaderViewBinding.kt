/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.readermode

import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.readerview.ReaderViewFeature.ColorScheme
import mozilla.components.lib.state.ext.flow
import mozilla.components.lib.state.helpers.AbstractBinding
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.PowerSavingMode
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.PowerSavingModeAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * A [BrowserStore] binding that, while Power Saving Mode is active, forces the selected tab into a dark reader view
 * whenever the page it loads can be displayed in one.
 *
 * Reader view is forced at most once per document per tab, so backing out of it is respected until that tab navigates
 * somewhere else. URLs are compared without their fragment, since a fragment-only change is a same-document navigation.
 *
 * Once Power Saving Mode is turned off, a forced reader view is left in place until the user reloads it, at which point
 * the original page is shown again.
 *
 * This binding should only be used in [org.mozilla.fenix.browser.BrowserFragment], since custom tabs have no reader
 * view.
 *
 * @param browserStore The [BrowserStore] to observe for tab state changes.
 * @param appStore The [AppStore] to observe [AppState.isPowerSavingModeActive] on, and to track the tabs whose reader
 *   view was forced in [AppState.powerSavingModeReaderViewTabIds].
 * @param readerModeController Used to toggle reader view and its color scheme.
 * @param mainDispatcher The [CoroutineDispatcher] on which the state observation and updates will occur.
 */
class PowerSavingModeReaderViewBinding(
    private val browserStore: BrowserStore,
    private val appStore: AppStore,
    private val readerModeController: ReaderModeController,
    mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) : AbstractBinding<BrowserState>(browserStore, mainDispatcher) {

    @VisibleForTesting internal val forcedUrls = mutableMapOf<String, String>()

    private var lastSelectedTabLoading: Pair<String, Boolean>? = null

    override suspend fun onState(flow: Flow<BrowserState>) {
        val isPowerSavingModeActiveFlow = appStore.flow().map { it.isPowerSavingModeActive }.distinctUntilChanged()

        flow
            .mapNotNull { it.selectedTab }
            .ifAnyChanged {
                arrayOf(it.id, it.content.url, it.content.loading, it.readerState.readerable, it.readerState.active)
            }
            .combine(isPowerSavingModeActiveFlow) { tab, isPowerSavingModeActive ->
                tab to isPowerSavingModeActive
            }
            .collect { (tab, isPowerSavingModeActive) ->
                val reloadStarted = lastSelectedTabLoading == (tab.id to false) && tab.content.loading
                lastSelectedTabLoading = tab.id to tab.content.loading

                readerModeController.setColorSchemeOverride(if (isPowerSavingModeActive) ColorScheme.DARK else null)
                releaseTabsNoLongerInForcedReaderView()

                if (!isPowerSavingModeActive) {
                    forcedUrls.clear()
                    if (reloadStarted) maybeLeaveForcedReaderView(tab)
                    return@collect
                }

                forcedUrls.keys.retainAll(browserStore.state.tabs.mapTo(mutableSetOf()) { it.id })
                maybeForceReaderView(tab)
            }
    }

    private fun releaseTabsNoLongerInForcedReaderView() {
        val released =
            appStore.state.powerSavingModeReaderViewTabIds.filterTo(mutableSetOf()) { tabId ->
                browserStore.state.findTab(tabId)?.readerState?.active != true
            }
        if (released.isNotEmpty()) {
            appStore.dispatch(PowerSavingModeAction.ForcedReaderViewLeft(released))
        }
    }

    private fun maybeLeaveForcedReaderView(tab: TabSessionState) {
        if (tab.id !in appStore.state.powerSavingModeReaderViewTabIds) return

        appStore.dispatch(PowerSavingModeAction.ForcedReaderViewLeft(setOf(tab.id)))
        readerModeController.hideReaderView()
    }

    private fun maybeForceReaderView(tab: TabSessionState) {
        if (!tab.readerState.readerable || tab.readerState.active) return

        val url = tab.content.url.substringBefore('#')
        // The user backed out of the reader view we forced for this page. Leave it alone until the tab navigates.
        if (forcedUrls[tab.id] == url) return

        // Latched before showing, because showReaderView() dispatches synchronously and re-enters this flow before
        // readerState.active flips, which would otherwise recurse.
        forcedUrls[tab.id] = url
        readerModeController.showReaderView()
        appStore.dispatch(PowerSavingModeAction.ReaderViewForced(tab.id))
        PowerSavingMode.readerViewForced.record(NoExtras())
    }
}
