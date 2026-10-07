/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.settings

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.fakes.android.FakePreferencesDataStore
import org.junit.Test

private const val ENGINE = "com.example.tts"
private const val OTHER_ENGINE = "come.example.other.tts"

class ListenSettingsTest {

    @Test
    fun `test that a language with no saved voice reads back as null`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())

        assertNull(settings.getSelectedVoiceId("en-US"))
    }

    @Test
    fun `test that the voice of each language is saved and read back on its own`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())
        settings.setSelectedVoiceId("en-US", "en-us-female")
        settings.setSelectedVoiceId("fr-FR", "fr-fr-male")

        assertEquals("en-us-female", settings.getSelectedVoiceId("en-US"))
        assertEquals("fr-fr-male", settings.getSelectedVoiceId("fr-FR"))
    }

    @Test
    fun `test that saving a voice for a language replaces the one saved before it`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())
        settings.setSelectedVoiceId("en-US", "en-us-female")
        settings.setSelectedVoiceId("en-US", "en-us-male")

        assertEquals("en-us-male", settings.getSelectedVoiceId("en-US"))
    }

    @Test
    fun `test that every voice is cleared when engine package is changed`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())
        settings.clearSavedVoicesOnEngineChange(ENGINE)
        settings.setSelectedVoiceId("en-US", "en-us-female")
        settings.setSelectedVoiceId("fr-FR", "fr-fr-male")

        settings.clearSavedVoicesOnEngineChange(OTHER_ENGINE)

        assertNull(settings.getSelectedVoiceId("en-US"))
        assertNull(settings.getSelectedVoiceId("fr-FR"))
    }

    @Test
    fun `test that the saved voices survive an engine that has not changed`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())
        settings.clearSavedVoicesOnEngineChange(ENGINE)
        settings.setSelectedVoiceId("en-US", "en-us-female")

        settings.clearSavedVoicesOnEngineChange(ENGINE)

        assertEquals("en-us-female", settings.getSelectedVoiceId("en-US"))
    }

    @Test
    fun `test that voices saved before any engine was recorded are cleared by the first one`() = runTest {
        val settings = DataStoreBackedSettings(FakePreferencesDataStore())
        settings.setSelectedVoiceId("en-US", "en-us-female")

        settings.clearSavedVoicesOnEngineChange(ENGINE)

        assertNull(settings.getSelectedVoiceId("en-US"))
    }
}
