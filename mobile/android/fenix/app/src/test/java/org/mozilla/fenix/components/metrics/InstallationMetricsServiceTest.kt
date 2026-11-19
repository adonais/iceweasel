/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.metrics

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.WorkManagerTestInitHelper
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import mozilla.components.lib.installation.blockstore.InstallBlockStore
import mozilla.components.lib.installation.blockstore.InstallState
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.utils.RunWhenReadyQueue
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class InstallationMetricsServiceTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private val visualCompletenessQueue = RunWhenReadyQueue(testScope)
    private lateinit var workManager: WorkManager

    @Before
    fun setup() {
        WorkManagerTestInitHelper.initializeTestWorkManager(
            testContext,
            Configuration.Builder().setWorkerFactory(PendingInstallationWorkerFactory()).build(),
        )
        workManager = WorkManager.getInstance(testContext)
    }

    @After
    fun teardown() {
        workManager.cancelAllWork()
        WorkManagerTestInitHelper.closeWorkDatabase()
    }

    private fun createService(isEnabled: () -> Boolean = { true }) =
        InstallationMetricsService(
            runWhenReadyQueue = visualCompletenessQueue,
            workManager = { workManager },
            isEnabled = isEnabled,
        )

    private fun becomeVisuallyComplete() {
        visualCompletenessQueue.ready()
        testDispatcher.scheduler.advanceUntilIdle()
    }

    private fun installationWork() = workManager.getWorkInfosForUniqueWork(InstallationMetricsService.WORK_NAME).get()

    @Test
    fun `GIVEN the service is started WHEN the app becomes visually complete THEN the installation worker is enqueued`() {
        createService().start()
        becomeVisuallyComplete()

        assertFalse(installationWork().single().state.isFinished)
    }

    @Test
    fun `GIVEN installation metrics are disabled WHEN the app becomes visually complete THEN the installation worker is not enqueued`() {
        createService(isEnabled = { false }).start()
        becomeVisuallyComplete()

        assertTrue(installationWork().isEmpty())
    }

    @Test
    fun `GIVEN the service is started WHEN the app is not visually complete THEN the installation worker is not enqueued`() {
        createService().start()
        testDispatcher.scheduler.advanceUntilIdle()

        assertTrue(installationWork().isEmpty())
    }

    @Test
    fun `GIVEN the service was started twice WHEN the app becomes visually complete THEN the installation worker is enqueued once`() {
        val service = createService()

        service.start()
        service.start()
        becomeVisuallyComplete()

        assertEquals(1, installationWork().size)
    }

    @Test
    fun `GIVEN the installation worker was enqueued WHEN the service is stopped and started again THEN the worker is cancelled and not enqueued again`() {
        val service = createService()
        service.start()
        becomeVisuallyComplete()

        service.stop()
        service.start()
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(WorkInfo.State.CANCELLED, installationWork().single().state)
    }

    @Test
    fun `GIVEN the service was stopped before the app is visually complete WHEN the app becomes visually complete THEN the installation worker is not enqueued`() {
        val service = createService()

        service.start()
        service.stop()
        becomeVisuallyComplete()

        assertTrue(installationWork().isEmpty())
    }

    /** Creates [InstallationWorker]s that never finish, so the scheduled work stays observable. */
    private class PendingInstallationWorkerFactory : WorkerFactory() {
        override fun createWorker(
            appContext: Context,
            workerClassName: String,
            workerParameters: WorkerParameters,
        ) = InstallationWorker(appContext, workerParameters, PendingInstallBlockStore())
    }

    private class PendingInstallBlockStore : InstallBlockStore {
        override suspend fun recordAppOpen(): Result<InstallState?> = awaitCancellation()
    }
}
