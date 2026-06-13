/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import mozilla.components.feature.session.TrackingProtectionUseCases.FetchTotalTrackersBlockedUseCase
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * View-bound feature that dispatches tracker blocked count changes to the [AppStore]
 * when tracker data is fetched from Gecko.
 *
 * @param appStore The [AppStore] to dispatch actions to.
 * @param fetchTotalTrackersBlocked Use case to fetch the total number of blocked trackers.
 * @param ioDispatcher The [CoroutineDispatcher] for database operations. Defaults to [Dispatchers.IO].
 */
class TrackersBlockedFeature(
    private val appStore: AppStore,
    private val fetchTotalTrackersBlocked: FetchTotalTrackersBlockedUseCase,
    ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : AbstractBinding<AppState>(appStore, ioDispatcher) {

    override fun start() {
        super.start()
        fetchTotalTrackersBlocked(
            onSuccess = { count ->
                appStore.dispatch(AppAction.UpdateTrackersBlockedCount(count))
            },
        )
    }

    override suspend fun onState(flow: Flow<AppState>) {
        // No-op: tracker count is fetched once on start rather than observed from a Flow.
    }
}
