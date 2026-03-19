/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import mozilla.components.feature.protection.dashboard.ProtectionsStorage
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * View-bound feature that dispatches tracker blocked count changes to the [AppStore]
 * when the [ProtectionsStorage] is updated.
 */
class TrackersBlockedFeature(
    private val appStore: AppStore,
    private val protectionsStorage: ProtectionsStorage,
) : AbstractBinding<AppState>(appStore) {

    override suspend fun onState(flow: Flow<AppState>) {
        protectionsStorage.getTotalCountAllTime()
            .distinctUntilChanged()
            .collect { count ->
                appStore.dispatch(AppAction.UpdateTrackersBlockedCount(count))
            }
    }
}
