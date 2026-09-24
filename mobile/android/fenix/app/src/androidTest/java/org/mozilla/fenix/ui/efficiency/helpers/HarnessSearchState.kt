/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.content.Context
import android.os.SystemClock
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import mozilla.components.browser.state.action.SearchAction
import mozilla.components.browser.state.state.SearchState
import mozilla.components.browser.state.state.selectedOrDefaultPrivateSearchEngine
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import org.mozilla.fenix.components.ADDITIONAL_BUNDLED_SEARCH_ENGINE_IDS
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.TestHelper.appContext

object HarnessSearchState {
    suspend fun clear() {
        val store = appContext.components.core.store
        withTimeout(SEARCH_READY_TIMEOUT_MS) {
            while (!store.state.search.complete) {
                delay(POLL_INTERVAL_MS)
            }
        }

        val current = store.state.search
        val order = current.regionSearchEnginesOrder.withIndex().associate { it.value to it.index }
        val regionEngines =
            (current.regionSearchEngines + current.hiddenSearchEngines)
                .distinctBy { it.id }
                .sortedBy { order[it.id] ?: Int.MAX_VALUE }
        val additionalAvailable =
            (current.additionalAvailableSearchEngines + current.additionalSearchEngines).distinctBy { it.id }
        val regionDefault =
            checkNotNull(current.regionDefaultSearchEngineId) {
                "Search configuration completed without a region default"
            }

        store.dispatch(
            SearchAction.SetSearchEnginesAction(
                regionSearchEngines = regionEngines,
                customSearchEngines = emptyList(),
                hiddenSearchEngines = emptyList(),
                disabledSearchEngineIds = ADDITIONAL_BUNDLED_SEARCH_ENGINE_IDS,
                additionalSearchEngines = emptyList(),
                additionalAvailableSearchEngines = additionalAvailable,
                userSelectedSearchEngineId = null,
                userSelectedSearchEngineName = null,
                userSelectedPrivateSearchEngineId = null,
                userSelectedPrivateSearchEngineName = null,
                regionDefaultSearchEngineId = regionDefault,
                regionSearchEnginesOrder = current.regionSearchEnginesOrder,
                searchEnginesConfigurationId = current.searchEnvironmentId,
            )
        )

        withTimeout(STORE_RESET_TIMEOUT_MS) {
            while (!isAtHarnessBoundary(store.state.search)) {
                delay(POLL_INTERVAL_MS)
            }
        }

        clearPersistentOverrides()
    }

    fun isAtHarnessBoundary(search: SearchState): Boolean =
        search.complete &&
            search.customSearchEngines.isEmpty() &&
            search.hiddenSearchEngines.isEmpty() &&
            search.additionalSearchEngines.isEmpty() &&
            search.userSelectedSearchEngineId == null &&
            search.userSelectedSearchEngineName == null &&
            search.userSelectedPrivateSearchEngineId == null &&
            search.userSelectedPrivateSearchEngineName == null &&
            search.selectedOrDefaultSearchEngine?.id == search.regionDefaultSearchEngineId &&
            search.selectedOrDefaultPrivateSearchEngine?.id == search.selectedOrDefaultSearchEngine?.id &&
            hasDefaultDisabledShortcuts(search)

    fun hasDefaultDisabledShortcuts(search: SearchState): Boolean =
        search.disabledSearchEngineIds.toSet() == ADDITIONAL_BUNDLED_SEARCH_ENGINE_IDS.toSet()

    fun persistentMetadataOverrideCount(): Int =
        appContext.getSharedPreferences(SEARCH_METADATA_PREFERENCES, Context.MODE_PRIVATE).all.count { (key, value) ->
            when (key) {
                HIDDEN_SEARCH_ENGINES,
                ADDITIONAL_SEARCH_ENGINES -> (value as? Set<*>)?.isNotEmpty() != false

                DISABLED_SEARCH_ENGINE_IDS ->
                    (value as? Set<*>)?.filterIsInstance<String>()?.toSet() !=
                        ADDITIONAL_BUNDLED_SEARCH_ENGINE_IDS.toSet()

                else -> true
            }
        }

    fun persistentCustomEngineCount(): Int =
        File(appContext.filesDir, CUSTOM_SEARCH_ENGINE_DIRECTORY)
            .listFiles { file -> file.extension == "xml" }
            .orEmpty()
            .size

    fun seedPersistentOverrideForContractTest() {
        check(
            appContext
                .getSharedPreferences(SEARCH_METADATA_PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .putString("harness_contract_override", "present")
                .commit()
        )
        File(appContext.filesDir, CUSTOM_SEARCH_ENGINE_DIRECTORY).apply {
            mkdirs()
            File(this, "harness-contract.xml").writeText("contract fixture")
        }
    }

    private suspend fun clearPersistentOverrides() =
        withContext(Dispatchers.IO) {
            val preferences = appContext.getSharedPreferences(SEARCH_METADATA_PREFERENCES, Context.MODE_PRIVATE)
            val customEngines = File(appContext.filesDir, CUSTOM_SEARCH_ENGINE_DIRECTORY)

            fun reset() {
                check(preferences.edit().clear().commit()) {
                    "Failed to synchronously clear search metadata"
                }
                check(!customEngines.exists() || customEngines.deleteRecursively()) {
                    "Failed to clear custom search engines"
                }
            }

            reset()
            var stableSince: Long? = null
            withTimeout(PERSISTENCE_RESET_TIMEOUT_MS) {
                while (true) {
                    delay(POLL_INTERVAL_MS)
                    val clean = preferences.all.isEmpty() && !customEngines.exists()
                    val now = SystemClock.elapsedRealtime()
                    if (!clean) {
                        reset()
                        stableSince = null
                    } else if (stableSince == null) {
                        stableSince = now
                    } else if (now - stableSince >= PERSISTENCE_STABILITY_MS) {
                        return@withTimeout
                    }
                }
            }
        }

    private const val SEARCH_METADATA_PREFERENCES = "mozac_feature_search_metadata"
    private const val HIDDEN_SEARCH_ENGINES = "hidden_search_engines"
    private const val ADDITIONAL_SEARCH_ENGINES = "additional_search_engines"
    private const val DISABLED_SEARCH_ENGINE_IDS = "preference_key_disabled_search_engine_id"
    private const val CUSTOM_SEARCH_ENGINE_DIRECTORY = "search-engines"
    private const val SEARCH_READY_TIMEOUT_MS = 5_000L
    private const val STORE_RESET_TIMEOUT_MS = 2_000L
    private const val PERSISTENCE_RESET_TIMEOUT_MS = 2_000L
    private const val PERSISTENCE_STABILITY_MS = 200L
    private const val POLL_INTERVAL_MS = 20L
}
