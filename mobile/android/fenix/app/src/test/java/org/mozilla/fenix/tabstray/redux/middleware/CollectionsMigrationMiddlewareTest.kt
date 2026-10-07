/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.middleware

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mozilla.fenix.home.collections.migration.fake.FakeCollectionsMigrationRepository
import org.mozilla.fenix.tabstray.redux.action.TabGroupAction
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.redux.store.TabsTrayStore

class CollectionsMigrationMiddlewareTest {

    private val repository = FakeCollectionsMigrationRepository(cardVisible = true)

    @Test
    fun `WHEN the migration card is dismissed THEN the card visibility is persisted as hidden`() {
        val store = createStore()

        store.dispatch(TabGroupAction.CollectionsMigrationCardDismissed)

        assertFalse(repository.shouldShowCollectionsMigrationCard())
    }

    @Test
    fun `WHEN an unrelated action is dispatched THEN the card visibility is unchanged`() {
        val store = createStore()

        store.dispatch(TabGroupAction.NewGroupAnimationFinished)

        assertTrue(repository.shouldShowCollectionsMigrationCard())
    }

    private fun createStore() =
        TabsTrayStore(
            initialState =
                TabsTrayState(tabGroupState = TabsTrayState.TabGroupState(showCollectionsMigrationCard = true)),
            middlewares = listOf(CollectionsMigrationMiddleware(repository = repository)),
        )
}
