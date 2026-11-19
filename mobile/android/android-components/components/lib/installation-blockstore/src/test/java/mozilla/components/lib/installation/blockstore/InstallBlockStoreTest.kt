/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.installation.blockstore

import android.content.Context
import android.content.SharedPreferences
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Status
import java.util.Calendar
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class InstallBlockStoreTest {

    private val today = date(2026, Calendar.OCTOBER, 13).time
    private val tomorrow = date(2026, Calendar.OCTOBER, 14).time
    private val apiError = ApiException(Status.RESULT_INTERNAL_ERROR)

    private val preferences: SharedPreferences
        get() = testContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    private fun createStore(
        blockStore: BlockStore,
        currentTimeMillis: Long = today,
        isBlockStoreAvailable: () -> Boolean = { true },
    ) = DefaultInstallBlockStore(testContext, blockStore, isBlockStoreAvailable) { currentTimeMillis }

    private fun date(year: Int, month: Int, day: Int) =
        Calendar.getInstance()
            .apply {
                clear()
                set(year, month, day)
            }
            .time

    @Test
    fun `GIVEN no previous install WHEN recordAppOpen is called THEN the first install is recorded`() = runTest {
        val blockStore = FakeBlockStore()

        val result = createStore(blockStore).recordAppOpen()

        assertEquals(InstallState(installCount = 1, previousLastSeenDate = null), result.getOrThrow())
        assertEquals("1", blockStore.values[KEY_INSTALL_COUNT])
        assertEquals("2026-10-13", blockStore.values[KEY_LAST_SEEN_DATE])
        assertEquals("2026-10-13", preferences.getString(PREF_LAST_SEEN_DATE, null))
    }

    @Test
    fun `GIVEN a previous install WHEN recordAppOpen is called after a reinstall THEN the install count is incremented and the previous date is returned`() =
        runTest {
            val blockStore =
                FakeBlockStore(
                    mutableMapOf(
                        KEY_INSTALL_COUNT to "2",
                        KEY_LAST_SEEN_DATE to "2026-09-01",
                    )
                )

            val result = createStore(blockStore).recordAppOpen()

            assertEquals(
                InstallState(installCount = 3, previousLastSeenDate = date(2026, Calendar.SEPTEMBER, 1)),
                result.getOrThrow(),
            )
            assertEquals("3", blockStore.values[KEY_INSTALL_COUNT])
            assertEquals("2026-10-13", blockStore.values[KEY_LAST_SEEN_DATE])
        }

    @Test
    fun `GIVEN the app open was recorded today WHEN recordAppOpen is called again THEN Block Store is not accessed`() =
        runTest {
            val blockStore = FakeBlockStore()
            createStore(blockStore).recordAppOpen()
            blockStore.retrieveCalls = 0
            blockStore.storeCalls = 0

            val result = createStore(blockStore).recordAppOpen()

            assertNull(result.getOrThrow())
            assertEquals(0, blockStore.retrieveCalls)
            assertEquals(0, blockStore.storeCalls)
        }

    @Test
    fun `GIVEN the app open was recorded today WHEN recordAppOpen is called again THEN Block Store availability is not checked`() =
        runTest {
            val blockStore = FakeBlockStore()
            createStore(blockStore).recordAppOpen()
            var availabilityChecked = false

            val result =
                createStore(blockStore) {
                        availabilityChecked = true
                        true
                    }
                    .recordAppOpen()

            assertNull(result.getOrThrow())
            assertFalse(availabilityChecked)
        }

    @Test
    fun `GIVEN the install was recorded on a previous day WHEN recordAppOpen is called THEN only the last seen date is refreshed`() =
        runTest {
            val blockStore = FakeBlockStore()
            createStore(blockStore).recordAppOpen()
            blockStore.retrieveError = apiError

            val result = createStore(blockStore, currentTimeMillis = tomorrow).recordAppOpen()

            assertNull(result.getOrThrow())
            assertEquals("1", blockStore.values[KEY_INSTALL_COUNT])
            assertEquals("2026-10-14", blockStore.values[KEY_LAST_SEEN_DATE])
            assertEquals("2026-10-14", preferences.getString(PREF_LAST_SEEN_DATE, null))
        }

    @Test
    fun `GIVEN the app was reinstalled WHEN recordAppOpen is called THEN a reinstall is recorded`() = runTest {
        val blockStore = FakeBlockStore()
        createStore(blockStore).recordAppOpen()
        preferences.edit().clear().commit()

        val result = createStore(blockStore).recordAppOpen()

        assertEquals(
            InstallState(installCount = 2, previousLastSeenDate = date(2026, Calendar.OCTOBER, 13)),
            result.getOrThrow(),
        )
    }

    @Test
    fun `GIVEN retrieving fails WHEN recordAppOpen is called THEN it fails and the install is recorded on the next call`() =
        runTest {
            val blockStore = FakeBlockStore(retrieveError = apiError)

            assertTrue(createStore(blockStore).recordAppOpen().isFailure)
            assertNull(blockStore.values[KEY_INSTALL_COUNT])
            assertNull(preferences.getString(PREF_LAST_SEEN_DATE, null))

            blockStore.retrieveError = null
            val result = createStore(blockStore).recordAppOpen()

            assertEquals(InstallState(installCount = 1, previousLastSeenDate = null), result.getOrThrow())
        }

    @Test
    fun `GIVEN storing the install count fails WHEN recordAppOpen is called THEN it fails and the install is recorded on the next call`() =
        runTest {
            val blockStore = FakeBlockStore(storeErrors = mutableMapOf(KEY_INSTALL_COUNT to apiError))

            assertTrue(createStore(blockStore).recordAppOpen().isFailure)

            blockStore.storeErrors.clear()
            val result = createStore(blockStore).recordAppOpen()

            assertEquals(InstallState(installCount = 1, previousLastSeenDate = null), result.getOrThrow())
        }

    @Test
    fun `GIVEN storing the last seen date fails WHEN recordAppOpen is called THEN the install state is still returned`() =
        runTest {
            val blockStore = FakeBlockStore(storeErrors = mutableMapOf(KEY_LAST_SEEN_DATE to apiError))

            val result = createStore(blockStore).recordAppOpen()

            assertEquals(InstallState(installCount = 1, previousLastSeenDate = null), result.getOrThrow())
            assertEquals("1", blockStore.values[KEY_INSTALL_COUNT])
        }

    @Test
    fun `GIVEN storing the last seen date failed WHEN recordAppOpen is called again the same day THEN only the last seen date is stored`() =
        runTest {
            val blockStore = FakeBlockStore(storeErrors = mutableMapOf(KEY_LAST_SEEN_DATE to apiError))
            createStore(blockStore).recordAppOpen()
            blockStore.storeErrors.clear()

            val result = createStore(blockStore).recordAppOpen()

            assertNull(result.getOrThrow())
            assertEquals("1", blockStore.values[KEY_INSTALL_COUNT])
            assertEquals("2026-10-13", blockStore.values[KEY_LAST_SEEN_DATE])
            assertEquals("2026-10-13", preferences.getString(PREF_LAST_SEEN_DATE, null))
        }

    @Test
    fun `GIVEN Block Store is unavailable WHEN recordAppOpen is called THEN nothing is recorded`() = runTest {
        val blockStore = FakeBlockStore()

        assertNull(createStore(blockStore) { false }.recordAppOpen().getOrThrow())

        assertEquals(0, blockStore.retrieveCalls)
        assertEquals(0, blockStore.storeCalls)
        assertNull(preferences.getString(PREF_LAST_SEEN_DATE, null))
    }

    private class FakeBlockStore(
        val values: MutableMap<String, String> = mutableMapOf(),
        var retrieveError: Exception? = null,
        val storeErrors: MutableMap<String, Exception> = mutableMapOf(),
    ) : BlockStore {
        var retrieveCalls = 0
        var storeCalls = 0

        override suspend fun retrieveBytes(keys: List<String>): Map<String, ByteArray> {
            retrieveCalls++
            retrieveError?.let { throw it }
            return values.filterKeys { it in keys }.mapValues { it.value.encodeToByteArray() }
        }

        override suspend fun storeBytes(key: String, bytes: ByteArray): Int {
            storeCalls++
            storeErrors[key]?.let { throw it }
            values[key] = bytes.decodeToString()
            return bytes.size
        }
    }
}
