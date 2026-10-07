/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.middleware

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.fenix.home.collections.migration.CollectionsMigrationRepository
import org.mozilla.fenix.tabstray.redux.action.TabGroupAction
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState

/**
 * [Middleware] that persists the visibility of the Collections to Tab Groups migration card. The visibility is shared
 * with the homepage card, so dismissing the card on the Tab Groups page also stops advertising the migration on the
 * homepage.
 *
 * @param repository The repository for the Collections migration.
 */
class CollectionsMigrationMiddleware(private val repository: CollectionsMigrationRepository) :
    Middleware<TabsTrayState, TabsTrayAction> {

    override fun invoke(
        store: Store<TabsTrayState, TabsTrayAction>,
        next: (TabsTrayAction) -> Unit,
        action: TabsTrayAction,
    ) {
        if (action is TabGroupAction.CollectionsMigrationCardDismissed) {
            repository.updateCollectionsMigrationCardVisibility(visible = false)
        }

        next(action)
    }
}
