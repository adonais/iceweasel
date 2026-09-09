/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration

import org.junit.Assert.assertFalse
import org.junit.Test
import org.mozilla.fenix.home.collections.migration.fake.FakeCollectionsMigrationRepository

class CollectionsMigrationCardMiddlewareTest {

    @Test
    fun `WHEN ViewTabGroupsClicked action is dispatched THEN update card visibility preference`() {
        val repository = FakeCollectionsMigrationRepository(cardVisible = true)
        val store =
            CollectionsMigrationCardStore(
                initialState = CollectionsMigrationCardState(visible = true),
                middleware = listOf(CollectionsMigrationCardMiddleware(repository)),
            )

        store.dispatch(CollectionsMigrationCardAction.ViewTabGroupsClicked)

        assertFalse(repository.shouldShowCollectionsMigrationCard())
    }
}
