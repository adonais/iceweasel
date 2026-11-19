/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.installation.blockstore

import android.content.Context
import androidx.core.content.edit
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import mozilla.components.support.base.log.logger.Logger

/** Key-value storage backed by Block Store. */
internal interface BlockStore {
    /** Retrieves the bytes stored for [keys]. */
    suspend fun retrieveBytes(keys: List<String>): Map<String, ByteArray>

    /** Stores [bytes] for [key], and returns the number of bytes stored. */
    suspend fun storeBytes(key: String, bytes: ByteArray): Int
}

/**
 * A [BlockStore] backed by [Blockstore.getClient].
 *
 * @param context The Android [Context] used to create the Block Store client.
 */
internal class ClientBlockStore(context: Context) : BlockStore {
    private val client by lazy { Blockstore.getClient(context) }

    override suspend fun retrieveBytes(keys: List<String>): Map<String, ByteArray> {
        val request = RetrieveBytesRequest.Builder().setKeys(keys).build()
        return client.retrieveBytes(request).await().blockstoreDataMap.mapValues { it.value.bytes }
    }

    override suspend fun storeBytes(key: String, bytes: ByteArray): Int {
        val request = StoreBytesData.Builder().setBytes(bytes).setKey(key).setShouldBackupToCloud(false).build()
        return client.storeBytes(request).await()
    }
}

/**
 * The install state of the app on this device.
 *
 * @property installCount Number of times the app has been installed, including the current install.
 * @property previousLastSeenDate Date the app was last opened before the current install, or null if there is no
 *   previous install.
 */
data class InstallState(
    val installCount: Int,
    val previousLastSeenDate: Date?,
)

internal const val KEY_INSTALL_COUNT = "mozilla.components.lib.installation.blockstore.install_count"
internal const val KEY_LAST_SEEN_DATE = "mozilla.components.lib.installation.blockstore.last_seen_date"
internal const val PREFERENCES_NAME = "mozilla.components.lib.installation.blockstore"
internal const val PREF_LAST_SEEN_DATE = "last_seen_date"

/** Stores the install count and the last date the app was opened. */
interface InstallBlockStore {
    /**
     * Records that the app was opened.
     *
     * @return A [Result] containing the [InstallState] if this call recorded a fresh install, null if the install was
     *   already recorded or Block Store is unavailable, or a failure if the install could not be recorded.
     */
    suspend fun recordAppOpen(): Result<InstallState?>

    companion object {

        /**
         * Creates a [InstallBlockStore].
         *
         * @param context The Android [Context] used to create the Block Store client and open the local preferences.
         */
        fun create(context: Context): InstallBlockStore =
            DefaultInstallBlockStore(
                context,
                ClientBlockStore(context),
                {
                    GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
                        ConnectionResult.SUCCESS
                },
            )
    }
}

/**
 * The default [InstallBlockStore].
 *
 * @param context The Android [Context] used to open the local preferences.
 * @param blockStore Storage that persists across reinstalls.
 * @param isBlockStoreAvailable Whether Block Store is available on the device.
 * @param currentTimeMillis Injectable wall-clock source, used to compute the last seen date. Defaults to
 *   [System.currentTimeMillis].
 */
internal class DefaultInstallBlockStore(
    context: Context,
    private val blockStore: BlockStore,
    private val isBlockStoreAvailable: () -> Boolean,
    private val currentTimeMillis: () -> Long = { System.currentTimeMillis() },
) : InstallBlockStore {
    private val logger = Logger("InstallBlockStore")
    private val preferences by lazy { context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE) }

    @Suppress("TooGenericExceptionCaught")
    override suspend fun recordAppOpen(): Result<InstallState?> {
        val today = currentDate()
        val lastSeenDate = preferences.getString(PREF_LAST_SEEN_DATE, null)
        val skipReason =
            when {
                lastSeenDate == today -> "App open already recorded today ($today)"
                !isBlockStoreAvailable() -> "Block Store is unavailable"
                else -> null
            }
        if (skipReason != null) {
            logger.debug("$skipReason, skipping")
            return Result.success(null)
        }

        val installState =
            try {
                if (lastSeenDate == null) recordInstall() else null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                logger.warn("Failed to record the install", e)
                return Result.failure(e)
            }

        try {
            store(KEY_LAST_SEEN_DATE, today)
            preferences.edit { putString(PREF_LAST_SEEN_DATE, today) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.warn("Failed to store the last seen date", e)
        }

        return Result.success(installState)
    }

    private suspend fun recordInstall(): InstallState {
        val stored =
            blockStore.retrieveBytes(listOf(KEY_INSTALL_COUNT, KEY_LAST_SEEN_DATE)).mapValues {
                it.value.decodeToString()
            }

        val installState =
            InstallState(
                installCount = (stored[KEY_INSTALL_COUNT]?.toIntOrNull() ?: 0) + 1,
                previousLastSeenDate = stored[KEY_LAST_SEEN_DATE]?.let { parseDate(it) },
            )

        store(KEY_INSTALL_COUNT, installState.installCount.toString())
        preferences.edit { putString(PREF_LAST_SEEN_DATE, "") }

        return installState
    }

    private suspend fun store(key: String, value: String) {
        val bytesStored = blockStore.storeBytes(key, value.encodeToByteArray())
        logger.debug("Stored $bytesStored bytes for $key with $value")
    }

    private fun parseDate(date: String) =
        try {
            dateFormat().parse(date)
        } catch (e: ParseException) {
            logger.warn("Failed to parse the stored last seen date", e)
            null
        }

    private fun currentDate() = dateFormat().format(Date(currentTimeMillis()))

    private fun dateFormat() = SimpleDateFormat("yyyy-MM-dd", Locale.US)
}
