/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.tabs

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.isActive
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.repository.TabRepository
import org.mozilla.fenix.ext.maxActiveTime
import org.mozilla.fenix.tabstray.ext.toDisplayTitle

/**
 * Default implementation of [TabRepository], backed by the [BrowserStore].
 *
 * @param browserStore The [BrowserStore] holding the open tabs to observe.
 */
class DefaultTabRepository(browserStore: BrowserStore) : TabRepository {

    override val tabFlow: Flow<TabRepository.Data> =
        browserStore.stateFlow
            .map { state ->
                TabRepository.Data(
                    selectedTabId = state.selectedTabId,
                    tabs = state.tabs.map { it.toTab() },
                )
            }
            .distinctUntilChanged()
}

private fun TabSessionState.toTab(): Tab =
    Tab(
        id = id,
        url = content.url,
        title = toDisplayTitle(),
        private = content.private,
        inactive = !isActive(maxActiveTime = maxActiveTime),
    )
