/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import android.util.Log
import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.appservices.sync15.DeviceType
import mozilla.appservices.syncmanager.DeviceSettings
import mozilla.appservices.syncmanager.ServiceStatus
import mozilla.appservices.syncmanager.SyncResult
import mozilla.components.concept.sync.AccessTokenInfo
import mozilla.components.concept.sync.OAuthScopedKey
import mozilla.components.concept.sync.PeriodicSyncConfig
import mozilla.components.concept.sync.SyncConfig
import mozilla.components.concept.sync.SyncEngine
import mozilla.components.concept.sync.SyncableStore
import mozilla.components.service.fxa.FxaDeviceSettingsCache
import mozilla.components.service.fxa.TestOAuthAccount
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.service.fxa.manager.GlobalAccountManager
import mozilla.components.service.fxa.manager.SCOPE_SYNC
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.whenever
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith

/** Integration test describing the behaviours of [WorkManagerSyncDispatcher] */
@RunWith(AndroidJUnit4::class)
class WorkManagerSyncDispatcherTest {

    /** Test rule that allows the live data observer in [WorkersLiveDataObserver] to execute synchronously */
    @get:Rule val instantExecutorRule = InstantTaskExecutorRule()
    private val testCoroutineDispatcher = StandardTestDispatcher()

    private lateinit var testSyncStatusObserver: TestSyncObserverStatus
    private val testRustSyncManager = TestRustSyncManager()
    private val fxaDeviceSettingsCache = FxaDeviceSettingsCache(testContext)

    /** Account manager - needed to ensure we get a valid auth info for sync */
    private val accountManager = mock<FxaAccountManager>()
    private val syncConfig =
        SyncConfig(
            supportedEngines = supportedSyncEngines,
            periodicSyncConfig = PeriodicSyncConfig(),
        )

    @Before
    fun setup() {
        val config =
            Configuration.Builder().setMinimumLoggingLevel(Log.DEBUG).setExecutor(SynchronousExecutor()).build()

        // set up device settings cache
        fxaDeviceSettingsCache.setToCache(
            DeviceSettings(
                fxaDeviceId = "device",
                name = "Test Device",
                kind = DeviceType.MOBILE,
            )
        )

        GlobalAccountManager.syncIoDispatcher = testCoroutineDispatcher
        setUpSyncEngineStores()

        // Initialize WorkManager for instrumentation tests.
        WorkManagerTestInitHelper.initializeTestWorkManager(testContext, config)

        testSyncStatusObserver = TestSyncObserverStatus()
    }

    @After
    fun tearDown() {
        fxaDeviceSettingsCache.clear()
        testSyncStatusObserver.clear()
        WorkManager.getInstance(testContext).cancelAllWork()
        WorkManagerTestInitHelper.closeWorkDatabase()
        GlobalAccountManager.syncIoDispatcher = Dispatchers.IO
    }

    @Test
    fun `given an immediate sync request, when the result is backed off, then the observer state transition is idle - started - idle`() =
        runTest(testCoroutineDispatcher) {
            // given a sync dispatcher configured to use sync counter
            val syncDispatcher = makeSyncDispatcher()

            // given that we set up observers and initialize
            syncDispatcher.register(testSyncStatusObserver)
            syncDispatcher.initialize()

            // when we dispatch sync now
            syncDispatcher.syncNow(reason = SyncReason.User, debounce = false)

            // when the sync gets backed off
            expectedSyncResults(BackedOffSyncResult)

            // then the observer changes should be as expected
            assertEquals(
                listOf(
                    TestSyncStatus.IDLE,
                    TestSyncStatus.STARTED,
                    TestSyncStatus.IDLE,
                ),
                testSyncStatusObserver.syncStatus,
            )
        }

    @Test
    fun `given a periodic sync request, when the result is backed off, then the observer state transition is idle - started - idle`() =
        runTest(testCoroutineDispatcher) {
            // given a sync dispatcher
            val syncDispatcher = makeSyncDispatcher()

            // given that we set up observers and initialize
            syncDispatcher.register(testSyncStatusObserver)
            syncDispatcher.initialize()

            // when we start periodic sync
            val periodicSyncConfig = requireNotNull(syncConfig.periodicSyncConfig)
            syncDispatcher.startPeriodicSync(
                unit = TimeUnit.MINUTES,
                period = periodicSyncConfig.periodMinutes.toLong(),
                initialDelay = periodicSyncConfig.initialDelayMinutes.toLong(),
            )

            // clear the engine sync timestamp to bypass the staggered sync
            WorkManagerSyncWorker.engineSyncTimestamp.clear()

            // when the periodic sync gets backed off
            expectedSyncResults(BackedOffSyncResult, workName = SyncWorkerName.Periodic.name)

            // then the observer changes should be as expected
            assertEquals(
                listOf(
                    TestSyncStatus.IDLE,
                    TestSyncStatus.STARTED,
                    TestSyncStatus.IDLE,
                ),
                testSyncStatusObserver.syncStatus,
            )
        }

    @Test
    fun `given an sync request, when the result is a network error, then the observer state transition is idle - started - idle`() =
        runTest(testCoroutineDispatcher) {
            // given a sync dispatcher
            val syncDispatcher = makeSyncDispatcher()

            // given that we set up observers and initialize
            syncDispatcher.register(testSyncStatusObserver)
            syncDispatcher.initialize()

            // when we dispatch sync now
            syncDispatcher.syncNow(reason = SyncReason.User, debounce = false)

            // when the sync encounters a network error
            expectedSyncResults(NetworkErrorSyncResult)

            // then the observer changes should go through IDLE -> STARTED -> IDLE state
            assertEquals(
                listOf(
                    TestSyncStatus.IDLE,
                    TestSyncStatus.STARTED,
                    TestSyncStatus.IDLE,
                ),
                testSyncStatusObserver.syncStatus,
            )
        }

    private fun expectedSyncResults(
        vararg expectedResults: SyncResult = arrayOf(SuccessfulSyncResult),
        workName: String = SyncWorkerName.Immediate.name,
    ) {
        expectedResults.forEach { result ->
            testRustSyncManager.expectedResult = result
            setUpAuthenticatedAccountManager()
            executeWork(workName)
            testCoroutineDispatcher.scheduler.advanceUntilIdle()
        }
    }

    private fun setUpSyncEngineStores() {
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
    }

    private fun setUpAuthenticatedAccountManager() {
        whenever(accountManager.connectedAccount()).thenReturn(AuthenticatedAccount)
        GlobalAccountManager.setInstance(accountManager)
    }

    /**
     * Helper function to make sure the work meets all the constraints and delays and get executed immediately within
     * the test lifecycle
     */
    private fun executeWork(workName: String) {
        val workInfos = WorkManager.getInstance(testContext).getWorkInfosForUniqueWork(workName).get()
        val workInfo = workInfos.first()

        val driver = requireNotNull(WorkManagerTestInitHelper.getTestDriver(testContext))
        driver.setInitialDelayMet(workInfo.id)
        driver.setAllConstraintsMet(workInfo.id)
        if (workInfo.periodicityInfo != null) {
            driver.setPeriodDelayMet(workInfo.id)
        }
    }

    private fun makeSyncDispatcher(syncConfig: SyncConfig = this.syncConfig): WorkManagerSyncDispatcher =
        WorkManagerSyncDispatcher(
            context = testContext,
            supportedEngines = supportedSyncEngines,
            syncConfig = syncConfig,
            coroutineContext = testCoroutineDispatcher,
            rustSyncManager = testRustSyncManager,
        )

    companion object {
        private val supportedSyncEngines = setOf(SyncEngine.Tabs, SyncEngine.Bookmarks)

        private val BackedOffSyncResult =
            SyncResult(
                status = ServiceStatus.BACKED_OFF,
                successful = emptyList(),
                failures = emptyMap(),
                persistedState = "",
                declined = emptyList(),
                nextSyncAllowedAt = Instant.MAX,
                telemetryJson = null,
            )
        private val NetworkErrorSyncResult =
            SyncResult(
                status = ServiceStatus.NETWORK_ERROR,
                successful = emptyList(),
                failures = emptyMap(),
                persistedState = "",
                declined = emptyList(),
                nextSyncAllowedAt = Instant.MAX,
                telemetryJson = null,
            )
        private val SuccessfulSyncResult =
            SyncResult(
                status = ServiceStatus.OK,
                successful = supportedSyncEngines.map { it.nativeName },
                failures = emptyMap(),
                persistedState = "",
                declined = emptyList(),
                nextSyncAllowedAt = Instant.MAX,
                telemetryJson = null,
            )

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

    /** Enum used to track the evolution of the sync status */
    private enum class TestSyncStatus {
        IDLE,
        STARTED,
        ERROR,
    }

    /** Test variant of [SyncStatusObserver] that tracks the callbacks invoked */
    private class TestSyncObserverStatus : SyncStatusObserver {
        private var _syncStatus = mutableListOf<TestSyncStatus>()

        val syncStatus: List<TestSyncStatus>
            get() = _syncStatus.toList()

        override fun onStarted() {
            _syncStatus.add(TestSyncStatus.STARTED)
        }

        override fun onIdle() {
            _syncStatus.add(TestSyncStatus.IDLE)
        }

        override fun onError(error: Exception?) {
            _syncStatus.add((TestSyncStatus.ERROR))
        }

        fun clear() {
            _syncStatus.clear()
        }
    }
}
