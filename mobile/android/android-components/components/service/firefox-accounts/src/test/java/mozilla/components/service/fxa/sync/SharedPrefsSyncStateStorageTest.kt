/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import android.content.Context
import androidx.core.content.edit
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SharedPrefsSyncStateStorageTest {

    private val sharedPrefs =
        testContext.getSharedPreferences(SharedPrefsSyncStateStorage.SYNC_STATE_PREFS_KEY, Context.MODE_PRIVATE)

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
    fun `GIVEN storage contains state, WHEN the storage is reset, THEN sync state is set to initial values and other entries are kept`() {
        storage.lastSynced = Instant.fromEpochMilliseconds(Clock.System.now().toEpochMilliseconds())
        storage.persistedSyncState = "{\"foo\": \"bar\"}"
        storage.storeSyncConnected(true)
        sharedPrefs.edit { putString("random key", "random value") }

        storage.reset()

        assertNull(storage.lastSynced, "lastSynced should be null after reset")
        assertNull(storage.persistedSyncState, "persistedSyncState should be null after reset")
        assertEquals(false, storage.syncConnected, "syncConnected should be false after reset")
        assertEquals(
            "random value",
            sharedPrefs.getString("random key", null),
            "unrelated entries should be kept after reset",
        )
    }

    @Test
    fun `GIVEN shared pref contains syncConnected, WHEN accessed, THEN it is returned`() {
        sharedPrefs.edit { putBoolean(SharedPrefsSyncStateStorage.SYNC_CONNECTED_KEY, true) }

        val syncConnected = storage.syncConnected
        assertNotNull(syncConnected)
        assertTrue(syncConnected, "syncConnected should be true")
    }

    @Test
    fun `GIVEN shared pref does not contain syncConnected, WHEN accessed, THEN null is returned`() {
        sharedPrefs.edit { remove(SharedPrefsSyncStateStorage.SYNC_CONNECTED_KEY) }

        assertNull(storage.syncConnected, "syncConnected should return null when the pref key does not exist")
    }

    @Test
    fun `GIVEN syncConnectedFlow is observed, WHEN syncConnected is updated, THEN sync state is emitted`() = runTest {
        val observedValues = mutableListOf<Boolean?>()
        val job = backgroundScope.launch {
            storage.syncConnectedFlow.collect {
                observedValues.add(it)
            }
        }
        // observe initial value
        testScheduler.runCurrent()

        // update and observe first change
        storage.storeSyncConnected(true)
        testScheduler.runCurrent()

        // update and observe second change
        storage.storeSyncConnected(false)
        testScheduler.runCurrent()

        // verify the sequence of observed values
        assertEquals(
            listOf(null, true, false),
            observedValues,
        )
        job.cancel()
    }
}
