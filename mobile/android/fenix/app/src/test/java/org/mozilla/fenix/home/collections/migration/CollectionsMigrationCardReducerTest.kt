/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration

import junit.framework.TestCase.assertFalse
import org.junit.Test

class CollectionsMigrationCardReducerTest {

    @Test
    fun `WHEN ViewTabGroupsClicked action is dispatched THEN the banner visibility is set to false`() {
        val store =
            CollectionsMigrationCardStore(
                initialState = CollectionsMigrationCardState(visible = true),
                middleware = emptyList(),
            )

        store.dispatch(CollectionsMigrationCardAction.ViewTabGroupsClicked)

        assertFalse(store.state.visible)
    }

    @Test
    fun `GIVEN the banner is hidden WHEN ViewTabGroupsClicked action is dispatched THEN it remains hidden`() {
        val store =
            CollectionsMigrationCardStore(
                initialState = CollectionsMigrationCardState(visible = false),
                middleware = emptyList(),
            )

        store.dispatch(CollectionsMigrationCardAction.ViewTabGroupsClicked)

        assertFalse(store.state.visible)
    }
}
