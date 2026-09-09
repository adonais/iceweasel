/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration

import mozilla.components.lib.state.Action
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store

/**
 * [State] of the Collections migration card.
 *
 * @property visible Whether the card is shown on the homepage.
 */
data class CollectionsMigrationCardState(val visible: Boolean) : State

/** [Action]s to dispatch through the [CollectionsMigrationCardStore] to modify [CollectionsMigrationCardState]. */
sealed interface CollectionsMigrationCardAction : Action {
    /** [CollectionsMigrationCardAction] dispatched when the user clicks the link to view their tab groups. */
    data object ViewTabGroupsClicked : CollectionsMigrationCardAction
}

/** The [Store] that holds the [CollectionsMigrationCardState] and applies [CollectionsMigrationCardAction]s. */
class CollectionsMigrationCardStore(
    initialState: CollectionsMigrationCardState,
    middleware: List<Middleware<CollectionsMigrationCardState, CollectionsMigrationCardAction>>,
) :
    Store<CollectionsMigrationCardState, CollectionsMigrationCardAction>(
        initialState = initialState,
        reducer = ::reduce,
        middleware = middleware,
    )

private fun reduce(
    state: CollectionsMigrationCardState,
    action: CollectionsMigrationCardAction,
): CollectionsMigrationCardState =
    when (action) {
        is CollectionsMigrationCardAction.ViewTabGroupsClicked -> state.copy(visible = false)
    }
