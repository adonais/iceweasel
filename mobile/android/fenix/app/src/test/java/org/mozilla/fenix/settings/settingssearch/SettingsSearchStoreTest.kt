/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsSearchStoreTest {

    @Test
    fun `GIVEN default state WHEN SearchQueryUpdated action is dispatched THEN query in state is updated`() {
        val query = "theme"
        val store = SettingsSearchStore()

        val initialState = SettingsSearchState.Default(recentSearches = emptyList())
        assert(store.state == initialState)

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))

        assert(store.state is SettingsSearchState.SearchInProgress)
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `GIVEN search in progress state WHEN SearchQueryUpdated action is dispatched with empty query THEN default state is dispatched`() {
        val store = SettingsSearchStore(
            initialState = SettingsSearchState.SearchInProgress(
                "theme",
                emptyList(),
                emptyList(),
                ),
        )
        assert(store.state is SettingsSearchState.SearchInProgress)

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(""))

        assert(store.state == SettingsSearchState.Default(emptyList()))
    }
}
