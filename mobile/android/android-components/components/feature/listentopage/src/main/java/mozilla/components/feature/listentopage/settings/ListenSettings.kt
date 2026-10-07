/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/**
 * Defines the contract for persisting and retrieving user settings related to the Listen to Page feature.
 *
 * Implementations are responsible for the underlying storage mechanism.
 *
 * @see [ListenSettings.Companion.inMemory] for a simple in-memory implementation suitable for testing or previews.
 */
interface ListenSettings {

    /**
     * @param languageTag The language of the article.
     * @return The id of the voice saved for [languageTag], or `null` when there is none.
     */
    suspend fun getSelectedVoiceId(languageTag: String): String?

    /**
     * Persists the voice the user picked for one article language.
     *
     * @param languageTag The language of the article.
     * @param voiceId The id of the picked voice.
     */
    suspend fun setSelectedVoiceId(languageTag: String, voiceId: String)

    /**
     * Drops every saved voice when [enginePackageName] is not the engine the choices were made in, and records it as
     * the engine the choices from now on belong to.
     *
     * @param enginePackageName The package name of the engine the voices are about to be loaded from.
     */
    suspend fun clearSavedVoicesOnEngineChange(enginePackageName: String)

    companion object {
        /**
         * Creates a simple in-memory implementation of [ListenSettings].
         *
         * This implementation does not persist data across sessions and is intended for use in tests, Compose previews,
         * or other scenarios where a lightweight, non-persistent implementation is needed.
         *
         * @return An in-memory [ListenSettings] instance.
         */
        fun inMemory(
            enginePackageName: String? = null,
            voiceIds: Map<String, String> = emptyMap(),
        ): ListenSettings =
            object : ListenSettings {
                private val savedVoiceIds = voiceIds.toMutableMap()
                private var savedEnginePackageName = enginePackageName

                override suspend fun getSelectedVoiceId(languageTag: String): String? = savedVoiceIds[languageTag]

                override suspend fun setSelectedVoiceId(languageTag: String, voiceId: String) {
                    savedVoiceIds[languageTag] = voiceId
                }

                override suspend fun clearSavedVoicesOnEngineChange(enginePackageName: String) {
                    if (savedEnginePackageName != enginePackageName) {
                        savedVoiceIds.clear()
                        savedEnginePackageName = enginePackageName
                    }
                }
            }

        /**
         * Creates a [DataStore]-backed implementation of [ListenSettings].
         *
         * Data is persisted across sessions using [Preferences].
         *
         * @param context The application [Context] used to access the data store.
         * @return A persistent [ListenSettings] instance backed by [DataStore].
         */
        fun dataStore(context: Context): ListenSettings = DataStoreBackedSettings(context.dataStore)
    }
}

internal class DataStoreBackedSettings(private val dataStore: DataStore<Preferences>) : ListenSettings {
    private val enginePackageNameKey = stringPreferencesKey("engine_package_name_key")

    override suspend fun getSelectedVoiceId(languageTag: String): String? =
        dataStore.data.first()[selectedVoiceKey(languageTag)]

    override suspend fun setSelectedVoiceId(languageTag: String, voiceId: String) {
        dataStore.updateData {
            it.toMutablePreferences().also { preferences ->
                preferences[selectedVoiceKey(languageTag)] = voiceId
            }
        }
    }

    override suspend fun clearSavedVoicesOnEngineChange(enginePackageName: String) {
        dataStore.updateData { stored ->
            if (stored[enginePackageNameKey] == enginePackageName) {
                return@updateData stored
            }
            stored.toMutablePreferences().also { preferences ->
                preferences
                    .asMap()
                    .keys
                    .filter { it.name.startsWith(SELECTED_VOICE_KEY_PREFIX) }
                    .forEach { preferences -= it }
                preferences[enginePackageNameKey] = enginePackageName
            }
        }
    }

    private fun selectedVoiceKey(languageTag: String) = stringPreferencesKey("$SELECTED_VOICE_KEY_PREFIX$languageTag")
}

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "listen_to_page_settings")

private const val SELECTED_VOICE_KEY_PREFIX = "selected_voice_"
