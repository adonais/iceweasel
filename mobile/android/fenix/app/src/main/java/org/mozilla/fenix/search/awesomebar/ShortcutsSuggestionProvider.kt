/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search.awesomebar

import android.graphics.Bitmap
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.state.searchEngines
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.awesomebar.AwesomeBar
import java.util.UUID

/**
 * A [AwesomeBar.SuggestionProvider] implementation that provides search engine suggestions.
 */
class ShortcutsSuggestionProvider(
    private val store: BrowserStore,
    private val settingsIcon: Bitmap?,
    private val searchShortcutsSettingsTitle: String,
    private val selectShortcutEngine: (engine: SearchEngine) -> Unit,
    private val selectShortcutEngineSettings: () -> Unit,
) : AwesomeBar.SuggestionProvider {
    override val id: String = UUID.randomUUID().toString()

    override suspend fun onInputChanged(text: String): List<AwesomeBar.Suggestion> {
        val suggestions = mutableListOf<AwesomeBar.Suggestion>()

        store.state.search.searchEngines.mapTo(suggestions) {
            AwesomeBar.Suggestion(
                provider = this,
                id = it.id,
                icon = it.icon,
                title = it.name,
                onSuggestionClicked = {
                    selectShortcutEngine(it)
                },
            )
        }

        suggestions.add(
            AwesomeBar.Suggestion(
                provider = this,
                id = searchShortcutsSettingsTitle,
                icon = settingsIcon,
                title = searchShortcutsSettingsTitle,
                onSuggestionClicked = {
                    selectShortcutEngineSettings()
                },
            ),
        )
        return suggestions
    }
}
