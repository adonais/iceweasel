/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlin.coroutines.CoroutineContext
import kotlin.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext

/** Internal read/write API for sync state. Only used within sync. */
internal interface SyncStateStorage {

    /** The last synced [Instant] timestamp or null if we have never been synced */
    var lastSynced: Instant?

    /**
     * Whether or not sync has been explicitly connected through an action. A `null` value indicates that no value has
     * been stored
     */
    val syncConnected: Boolean?

    /** An observable variation of [syncConnected] */
    val syncConnectedFlow: Flow<Boolean?>

    /**
     * Persisted sync state received as a result of a successful sync. The absence of a value indicates that sync has
     * not happened yet
     */
    var persistedSyncState: String?

    /** Stores whether or not sync is connected on this device. */
    fun storeSyncConnected(connected: Boolean)

    /**
     * Resets sync storage states. This is different from clearing, because reset sets all values to some initial state,
     * and does not remove the entries from storage.
     */
    fun reset()

    /** Clears all sync state. */
    fun clear()

    /** Marker interface for providing a [SyncStateStorage] instance. */
    fun interface Provider {

        /** Returns a [SyncStateStorage] */
        suspend fun get(): SyncStateStorage
    }
}

/** A [SyncStateStorage] implementation backed by shared preferences. */
internal class SharedPrefsSyncStateStorage(private val sharedPrefs: SharedPreferences) : SyncStateStorage {

    override var lastSynced: Instant?
        get() =
            sharedPrefs.getLong(SYNC_LAST_SYNCED_KEY, 0).takeIf { it > 0L }?.let { Instant.fromEpochMilliseconds(it) }
        set(value) {
            sharedPrefs.edit {
                putLong(SYNC_LAST_SYNCED_KEY, value?.toEpochMilliseconds() ?: 0)
            }
        }

    /**
     * Whether or not sync has been explicitly connected through an action. A `null` value indicates that the value has
     * never been set.
     *
     * **Note**: [SyncStateStorage.syncConnected] alone does not represent whether sync should be considered connected
     * in the app. It only tells us that this value has been set and saved to the storage.
     *
     * The true representation of whether sync is truly connected is determined by [SyncManager], and in combination
     * with other states like presence of an authenticated account, with the right scope, etc.
     */
    override val syncConnected: Boolean?
        get() =
            if (sharedPrefs.contains(SYNC_CONNECTED_KEY)) sharedPrefs.getBoolean(SYNC_CONNECTED_KEY, false) else null

    override val syncConnectedFlow: Flow<Boolean?>
        get() = callbackFlow {
            trySend(syncConnected)
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, changedKey ->
                if (changedKey == null || changedKey == SYNC_CONNECTED_KEY) trySend(syncConnected)
            }
            sharedPrefs.registerOnSharedPreferenceChangeListener(listener)
            awaitClose { sharedPrefs.unregisterOnSharedPreferenceChangeListener(listener) }
        }

    override fun storeSyncConnected(connected: Boolean) {
        sharedPrefs.edit { putBoolean(SYNC_CONNECTED_KEY, connected) }
    }

    override var persistedSyncState: String?
        get() = sharedPrefs.getString(SYNC_STATE_KEY, null)
        set(value) {
            sharedPrefs.edit {
                putString(SYNC_STATE_KEY, value)
            }
        }

    override fun reset() {
        sharedPrefs.edit {
            putLong(SYNC_LAST_SYNCED_KEY, 0)
            putString(SYNC_STATE_KEY, null)
            putBoolean(SYNC_CONNECTED_KEY, false)
        }
    }

    override fun clear() {
        sharedPrefs.edit { clear() }
    }

    companion object {
        const val SYNC_STATE_PREFS_KEY = "syncPrefs"
        const val SYNC_LAST_SYNCED_KEY = "lastSynced"
        const val SYNC_STATE_KEY = "persistedState"
        const val SYNC_CONNECTED_KEY = "syncConnected"
    }

    /**
     * A [SyncStateStorage.Provider] implementation that returns a singleton [SharedPrefsSyncStateStorage] instance.
     *
     * This is an async provider, because creating the [SharedPrefsSyncStateStorage] instance involves an I/O operation
     * and we use the application [context] and [coroutineContext] to ensure background creation
     */
    internal class SingletonProvider(
        private val context: Context,
        private val coroutineContext: CoroutineContext = Dispatchers.IO,
    ) : SyncStateStorage.Provider {
        private var instance: SyncStateStorage? = null

        /**
         * The first time we try to provide the storage, we have to do an I/O operation So this function requires us to
         * do so in the background thread to avoid main thread I/O
         */
        override suspend fun get(): SyncStateStorage {
            return instance
                ?: withContext(coroutineContext) {
                    val prefs = context.getSharedPreferences(SYNC_STATE_PREFS_KEY, Context.MODE_PRIVATE)
                    SharedPrefsSyncStateStorage(prefs).also { instance = it }
                }
        }
    }
}
