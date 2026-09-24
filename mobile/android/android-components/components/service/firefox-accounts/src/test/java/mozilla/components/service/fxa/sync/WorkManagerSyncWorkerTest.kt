/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.testing.TestListenableWorkerBuilder
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.appservices.sync15.DeviceType
import mozilla.appservices.syncmanager.DeviceSettings
import mozilla.appservices.syncmanager.ServiceStatus
import mozilla.appservices.syncmanager.SyncResult
import mozilla.components.concept.sync.AccessTokenInfo
import mozilla.components.concept.sync.OAuthScopedKey
import mozilla.components.concept.sync.SyncEngine
import mozilla.components.concept.sync.SyncableStore
import mozilla.components.service.fxa.FxaDeviceSettingsCache
import mozilla.components.service.fxa.TestOAuthAccount
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.service.fxa.manager.GlobalAccountManager
import mozilla.components.service.fxa.manager.SCOPE_SYNC
import mozilla.components.support.test.fakes.android.FakeSharedPreferences
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.whenever
import org.junit.runner.RunWith

/**
 * Unit tests for [WorkManagerSyncWorker] that powers sync.
 *
 * The tests here are focused on unit behaviour The integration-style tests for the whole "syncing" behaviours are in
 * [WorkManagerSyncDispatcherTest]
 */
@RunWith(AndroidJUnit4::class)
class WorkManagerSyncWorkerTest {

    private val fxaDeviceSettingsCache = FxaDeviceSettingsCache(testContext)
    private val testRustSyncManager = TestRustSyncManager()

    /** Account manager - needed to ensure we get a valid auth info for sync */
    private val accountManager = mock<FxaAccountManager>()
    private val supportedSyncEngines = setOf(SyncEngine.Tabs, SyncEngine.Bookmarks)
    private val syncStateMutableStorage = SharedPrefsSyncStateStorage(sharedPrefs = FakeSharedPreferences())
    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        setUpSyncManagerDependencies()
    }

    @AfterTest
    fun tearDown() {
        fxaDeviceSettingsCache.clear()
    }

    @Test
    fun `WHEN sync returns a success result, THEN the sync state in the result is persisted`() =
        runTest(testDispatcher) {
            // given sync state was previously null
            syncStateMutableStorage.persistedSyncState = null

            // when we sync successfully
            val successfulSyncResult =
                createSyncResult(
                    status = ServiceStatus.OK,
                    persistedState = "{\"foo\":\"bar\"}",
                )
            val worker = createSyncWorker(expectedResult = successfulSyncResult)
            worker.doWork()

            // then the sync state is persisted
            assertEquals(
                expected = successfulSyncResult.persistedState,
                actual = syncStateMutableStorage.persistedSyncState,
            )
        }

    @Test
    fun `WHEN sync returns an error, THEN the sync state in the result is persisted`() =
        runTest(testDispatcher) {
            // given sync state was previously null
            syncStateMutableStorage.persistedSyncState = null

            // when sync returns an error
            val errorSyncResult =
                createSyncResult(
                    status = ServiceStatus.NETWORK_ERROR,
                    persistedState = "{\"foo\":\"bar\"}",
                )
            val worker = createSyncWorker(expectedResult = errorSyncResult)
            worker.doWork()

            // then the sync state is persisted
            assertEquals(errorSyncResult.persistedState, syncStateMutableStorage.persistedSyncState)
        }

    @Test
    fun `GIVEN persistedSyncState exists, WHEN we do a new sync, THEN the stored persistedSyncState is passed to rust sync manager`() =
        runTest(testDispatcher) {
            // given persisted sync state exists
            val storedPersistedSyncState = "{\"foo\":\"bar\"}"
            syncStateMutableStorage.persistedSyncState = storedPersistedSyncState

            // WHEN we sync and we receive an error result
            val actualSyncResult =
                createSyncResult(
                    status = ServiceStatus.NETWORK_ERROR,
                    persistedState = "{\"bar\":\"foo\"}",
                )
            val worker = createSyncWorker(expectedResult = actualSyncResult)
            worker.doWork()

            // THEN the actual state sent to rust manager is what was persisted in the storage
            assertEquals(
                expected = storedPersistedSyncState,
                actual = testRustSyncManager.requestedSyncParams.persistedState,
            )
        }

    @Test
    fun `GIVEN persistedSyncState does not exist, WHEN the work executes, an empty string is passed to rust sync manager`() =
        runTest(testDispatcher) {
            // given persisted sync state does not exist
            syncStateMutableStorage.persistedSyncState = null

            // WHEN we sync and we receive an error result
            val actualSyncResult =
                createSyncResult(
                    status = ServiceStatus.NETWORK_ERROR,
                    persistedState = "{\"bar\":\"foo\"}",
                )
            val worker = createSyncWorker(expectedResult = actualSyncResult)
            worker.doWork()

            // THEN the actual state sent to rust manager is what was persisted in the storage
            assertEquals(
                expected = "",
                actual = testRustSyncManager.requestedSyncParams.persistedState,
            )
        }

    @Test
    fun `GIVEN successful sync at a specific time, WHEN worker returns, THEN the timestamp of the last sync is updated`() =
        runTest(testDispatcher) {
            // given successful sync at specific time
            val lastSyncTime = Instant.fromEpochMilliseconds(1000)
            FakeClock.expectedInstantNow = lastSyncTime
            val successfulSyncResult = createSyncResult(status = ServiceStatus.OK)
            val worker = createSyncWorker(expectedResult = successfulSyncResult)
            worker.doWork()

            // then the last sync timestamp is updated
            assertEquals(lastSyncTime, syncStateMutableStorage.lastSynced)
        }

    @Test
    fun `GIVEN non-success sync at a specific time, THEN the last sync time is not updated`() =
        runTest(testDispatcher) {
            // given non-success sync at specific time
            val lastSyncTime = Instant.fromEpochMilliseconds(1000)
            FakeClock.expectedInstantNow = lastSyncTime
            val errorSyncResult = createSyncResult(status = ServiceStatus.NETWORK_ERROR)
            val worker = createSyncWorker(expectedResult = errorSyncResult)
            worker.doWork()

            // then the last sync timestamp is not updated
            assertNull(syncStateMutableStorage.lastSynced, "Last sync time should not be updated")
        }

    // region Test Helpers

    private fun setUpSyncManagerDependencies() {
        // set up sync engine stores
        supportedSyncEngines.forEach { engine ->
            GlobalSyncableStoreProvider.configureStore(
                storePair =
                    engine to
                        lazy {
                            object : SyncableStore {
                                override fun registerWithSyncManager() {}
                            }
                        }
            )
        }

        // set up authenticated account manager
        whenever(accountManager.connectedAccount()).thenReturn(AuthenticatedAccount)
        GlobalAccountManager.setInstance(accountManager)
        GlobalAccountManager.setRustSyncManager(testRustSyncManager)
        GlobalAccountManager.setSyncStateStorageProvider { syncStateMutableStorage }
        GlobalAccountManager.syncIoDispatcher = testDispatcher
        GlobalAccountManager.setTestClock(FakeClock)

        // set up FxaDeviceSettingsCache
        fxaDeviceSettingsCache.setToCache(
            DeviceSettings(
                fxaDeviceId = "device",
                name = "Test Device",
                kind = DeviceType.MOBILE,
            )
        )
    }

    private fun createSyncWorker(
        expectedResult: SyncResult = createSyncResult(ServiceStatus.NETWORK_ERROR, "")
    ): WorkManagerSyncWorker {
        testRustSyncManager.expectedResult = expectedResult
        return TestListenableWorkerBuilder<WorkManagerSyncWorker>(
                context = testContext,
                inputData =
                    WorkManagerSyncDispatcher.getWorkerData(
                        reason = SyncReason.User,
                        supportedEngines = supportedSyncEngines,
                        customEngineSubset = emptyList(),
                    ),
            )
            .build()
    }

    /** Create a [SyncResult] for testing. */
    private fun createSyncResult(
        status: ServiceStatus,
        persistedState: String = "",
        successful: List<String> = emptyList(),
    ): SyncResult {
        return SyncResult(
            status = status,
            successful = successful,
            failures = emptyMap(),
            persistedState = persistedState,
            declined = emptyList(),
            nextSyncAllowedAt = null,
            telemetryJson = null,
        )
    }

    companion object {

        private object FakeClock : GlobalAccountManager.Clock {
            var expectedInstantNow: Instant = Instant.fromEpochMilliseconds(1000)

            override fun getTimeCheckPoint(): Long = 0

            override fun now(): Instant = expectedInstantNow
        }

        private val AuthenticatedAccount =
            object : TestOAuthAccount() {
                override suspend fun getAccessToken(singleScope: String): AccessTokenInfo {
                    return AccessTokenInfo(
                        scope = SCOPE_SYNC,
                        token = "token",
                        key =
                            OAuthScopedKey(
                                kty = "kty",
                                scope = SCOPE_SYNC,
                                kid = "kid",
                                k = "k",
                            ),
                        expiresAt = 15L,
                    )
                }

                override suspend fun getTokenServerEndpointURL(): String {
                    return "token server url"
                }
            }
    }

    // endregion
}
