/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import androidx.core.content.edit
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import mozilla.components.support.test.fakes.android.FakeSharedPreferences
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SharedPrefsSyncStateStorageTest {
    private val sharedPrefs = FakeSharedPreferences()

    private lateinit var storage: SyncStateStorage

    @BeforeTest
    fun setUp() {
        storage = SharedPrefsSyncStateStorage(sharedPrefs)
    }

    @Test
    fun `GIVEN shared prefs does not have last synced, WHEN accessed, THEN null is returned`() {
        assertNull(storage.lastSynced, "lastSynced should be null since no state exists")
    }

    @Test
    fun `GIVEN shared prefs contains last synced, WHEN accessed, THEN it is returned`() {
        // the conversion from epoch milliseconds to epoch milliseconds is so that we can remove the nanoseconds
        // component, for reliable testing
        val lastSynced = Instant.fromEpochMilliseconds(Clock.System.now().toEpochMilliseconds())
        sharedPrefs.edit { putLong(SharedPrefsSyncStateStorage.SYNC_LAST_SYNCED_KEY, lastSynced.toEpochMilliseconds()) }

        assertEquals(lastSynced, storage.lastSynced, "lastSynced should be $lastSynced")
    }

    @Test
    fun `GIVEN shared prefs does not persist sync state, WHEN accessed, THEN null is returned`() {
        assertNull(storage.persistedSyncState, "persistedSyncState should be null since no state exists")
    }

    @Test
    fun `GIVEN shared prefs contains empty string sync state, WHEN accessed, THEN the empty string is returned`() {
        sharedPrefs.edit { putString(SharedPrefsSyncStateStorage.SYNC_STATE_KEY, "") }

        assertEquals("", storage.persistedSyncState, "persistedSyncState should be empty string")
    }

    @Test
    fun `GIVEN shared prefs contains non-empty sync state exists, WHEN accessed, THEN it is returned`() {
        val persistedSyncState = "{\"foo\": \"bar\"}"
        sharedPrefs.edit { putString(SharedPrefsSyncStateStorage.SYNC_STATE_KEY, persistedSyncState) }

        assertEquals(persistedSyncState, storage.persistedSyncState, "persistedSyncState should be $persistedSyncState")
    }

    @Test
    fun `GIVEN storage contains state, WHEN the storage is cleared, THEN all state is cleared`() {
        storage.lastSynced = Instant.fromEpochMilliseconds(Clock.System.now().toEpochMilliseconds())
        storage.persistedSyncState = "{\"foo\": \"bar\"}"
        sharedPrefs.edit { putString("random key", "random value") }

        storage.clear()

        assertEquals(emptyMap<String, Any?>(), sharedPrefs.all, "shared prefs should be empty after clearing")
    }

    @Test
    fun `GIVEN shared pref contains syncEnabled, WHEN accessed, THEN it is returned`() {
        sharedPrefs.edit { putBoolean(SharedPrefsSyncStateStorage.SYNC_ENABLED_KEY, true) }

        assertTrue(storage.syncEnabled, "syncEnabled should be true")
    }

    @Test
    fun `GIVEN shared pref does not contain syncEnabled, WHEN accessed, THEN false is returned`() {
        assertFalse(storage.syncEnabled, "syncEnabled should be false when the pref key does not exist")
    }

    @Test
    fun `GIVEN shared pref does not contain syncEnabled, WHEN accessed, THEN shared pref should still not contain syncEnabled`() {
        sharedPrefs.edit { clear() }

        val syncEnabled = storage.syncEnabled

        assertFalse(syncEnabled)
        assertFalse(
            sharedPrefs.contains(SharedPrefsSyncStateStorage.SYNC_ENABLED_KEY),
            "pref key should remain null after read-access",
        )
    }
}
