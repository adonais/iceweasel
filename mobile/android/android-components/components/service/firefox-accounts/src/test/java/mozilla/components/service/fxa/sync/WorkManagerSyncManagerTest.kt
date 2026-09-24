/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkerParameters
import androidx.work.impl.utils.taskexecutor.TaskExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import kotlinx.coroutines.test.StandardTestDispatcher
import mozilla.components.concept.sync.SyncConfig
import mozilla.components.concept.sync.SyncEngine
import mozilla.components.service.fxa.sync.WorkManagerSyncWorker.Companion.SYNC_STAGGER_BUFFER_MS
import mozilla.components.service.fxa.sync.WorkManagerSyncWorker.Companion.engineSyncTimestamp
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.`when`

@RunWith(AndroidJUnit4::class)
class WorkManagerSyncManagerTest {
    private lateinit var mockParam: WorkerParameters
    private lateinit var mockTags: Set<String>
    private lateinit var mockTaskExecutor: TaskExecutor
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        mockParam = mock()
        mockTags = mock()
        mockTaskExecutor = mock()
        `when`(mockParam.taskExecutor).thenReturn(mockTaskExecutor)
        `when`(mockTaskExecutor.serialTaskExecutor).thenReturn(mock())
        `when`(mockParam.tags).thenReturn(mockTags)

        WorkManagerTestInitHelper.initializeTestWorkManager(
            testContext,
            Configuration.Builder().build(),
        )
    }

    @Test
    fun `GIVEN work is not set to be debounced THEN it is not considered to be synced within the buffer`() {
        `when`(mockTags.contains(SyncWorkerTag.Debounce.name)).thenReturn(false)

        engineSyncTimestamp["test"] = System.currentTimeMillis() - SYNC_STAGGER_BUFFER_MS - 100L
        engineSyncTimestamp["test2"] = System.currentTimeMillis()

        val workerManagerSyncWorker = WorkManagerSyncWorker(testContext, mockParam)

        assertFalse(workerManagerSyncWorker.isDebounced())
        assertFalse(workerManagerSyncWorker.lastSyncedWithinStaggerBuffer("test"))
        assertFalse(workerManagerSyncWorker.lastSyncedWithinStaggerBuffer("test2"))
    }

    @Test
    fun `GIVEN work is set to be debounced THEN last synced timestamp is compared to buffer`() {
        `when`(mockTags.contains(SyncWorkerTag.Debounce.name)).thenReturn(true)

        engineSyncTimestamp["test"] = System.currentTimeMillis() - SYNC_STAGGER_BUFFER_MS - 100L
        engineSyncTimestamp["test2"] = System.currentTimeMillis()

        val workerManagerSyncWorker = WorkManagerSyncWorker(testContext, mockParam)

        assert(workerManagerSyncWorker.isDebounced())
        assertFalse(workerManagerSyncWorker.lastSyncedWithinStaggerBuffer("test"))
        assert(workerManagerSyncWorker.lastSyncedWithinStaggerBuffer("test2"))
    }

    @Test
    fun `isWithinStaggerBuffer is true just inside the buffer and false at or beyond it`() {
        val now = 1_000_000L
        assertTrue(isWithinStaggerBuffer(lastSyncedMs = now - (SYNC_STAGGER_BUFFER_MS - 1), now = now))
        assertFalse(isWithinStaggerBuffer(lastSyncedMs = now - SYNC_STAGGER_BUFFER_MS, now = now))
    }

    @Test
    fun `GIVEN work is set to be debounced WHEN there is not a saved time stamp THEN work will not be debounced`() {
        `when`(mockTags.contains(SyncWorkerTag.Debounce.name)).thenReturn(true)

        val workerManagerSyncWorker = WorkManagerSyncWorker(testContext, mockParam)

        assert(workerManagerSyncWorker.isDebounced())
        assertFalse(workerManagerSyncWorker.lastSyncedWithinStaggerBuffer("test"))
    }

    @Test
    fun `WHEN workerStateChanged receives null state THEN nothing happens`() {
        val observer = FakeSyncStatusObserver()
        val syncManager = createSyncManager(observer)

        syncManager.syncDispatcher?.workersStateChanged(null)

        assertTrue(observer.events.isEmpty())
        assertFalse(syncManager.isSyncActive())
    }

    @Test
    fun `WHEN workerStateChanged receives empty list THEN nothing happens`() {
        val observer = FakeSyncStatusObserver()
        val syncManager = createSyncManager(observer)

        syncManager.syncDispatcher?.workersStateChanged(emptyList())

        assertTrue(observer.events.isEmpty())
        assertFalse(syncManager.isSyncActive())
    }

    @Test
    fun `WHEN workerStateChanged receives ENQUEUED state THEN nothing happens`() {
        val observer = FakeSyncStatusObserver()
        val syncManager = createSyncManager(observer)

        syncManager.syncDispatcher?.workersStateChanged(listOf(WorkInfo.State.ENQUEUED))

        assertTrue(observer.events.isEmpty())
        assertFalse(syncManager.isSyncActive())
    }

    private fun createSyncManager(observer: FakeSyncStatusObserver): WorkManagerSyncManager =
        WorkManagerSyncManager(
                context = testContext,
                syncConfig = SyncConfig(supportedEngines = setOf(SyncEngine.Tabs), periodicSyncConfig = null),
                coroutineContext = testDispatcher,
            )
            .apply {
                registerSyncStatusObserver(observer)
                start()
            }
}
