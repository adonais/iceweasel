/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.app.NotificationManager
import android.content.Context
import android.os.Looper
import androidx.concurrent.futures.await
import androidx.core.app.NotificationManagerCompat
import androidx.work.Configuration
import androidx.work.DelegatingWorkerFactory
import androidx.work.ListenableWorker.Result
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.TRACKERS
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.test.fakes.engine.FakeEngine
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.utils.FakeDateTimeProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.privacyreport.PrivacyReportNotificationWorker.Companion.cancel
import org.mozilla.fenix.privacyreport.PrivacyReportNotificationWorker.Companion.schedule
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

private const val NOW = 1_700_000_000_000L
private const val PRIVACY_REPORT_NOTIFICATION_WORK_NAME = "org.mozilla.fenix.privacyreport.work"

/**
 * Fake current time used by scheduling tests. It matches the onboarding completion timestamp below, producing a
 * one-week initial delay and preventing WorkManager's synchronous test executor from running the worker during
 * scheduling-only tests.
 */
private const val SCHEDULING_FAKE_NOW = 1_000L

@RunWith(RobolectricTestRunner::class)
class PrivacyReportNotificationWorkerTest {

    private lateinit var settings: Settings
    private lateinit var fakeEngine: ControllableFakeEngine
    private lateinit var trackingProtectionUseCases: TrackingProtectionUseCases
    private lateinit var notificationsDelegate: NotificationsDelegate

    @Before
    fun setUp() {
        settings = Settings(testContext)

        fakeEngine = ControllableFakeEngine()
        trackingProtectionUseCases = TrackingProtectionUseCases(BrowserStore(), fakeEngine)

        notificationsDelegate = NotificationsDelegate(NotificationManagerCompat.from(testContext))
        shadowOf(testContext.getSystemService(NotificationManager::class.java) as NotificationManager)
            .setNotificationsEnabled(true)

        // The default WorkManager instance doesn't go through FenixApplication's
        // Configuration.Provider in this test environment, so schedule()/cancel() need their own
        // WorkerFactory wiring to be able to actually construct the worker.
        val configuration =
            Configuration.Builder()
                .setWorkerFactory(
                    DelegatingWorkerFactory().apply {
                        addFactory(
                            PrivacyReportWorkerFactory(settings, trackingProtectionUseCases, notificationsDelegate)
                        )
                    }
                )
                .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(testContext, configuration)
    }

    @After
    fun tearDown() {
        // Close WorkManager's internal database to prevent leaked SQLite resources from being reported against
        // subsequent tests.
        WorkManagerTestInitHelper.closeWorkDatabase()
    }

    private fun buildWorker(): PrivacyReportNotificationWorker =
        TestListenableWorkerBuilder<PrivacyReportNotificationWorker>(testContext)
            .setWorkerFactory(
                object : WorkerFactory() {
                    override fun createWorker(
                        appContext: Context,
                        workerClassName: String,
                        workerParameters: WorkerParameters,
                    ) =
                        PrivacyReportNotificationWorker(
                            appContext,
                            workerParameters,
                            settings = settings,
                            trackingProtectionUseCases = trackingProtectionUseCases,
                            notificationsDelegate = notificationsDelegate,
                            dateTimeProvider = FakeDateTimeProvider(currentTime = NOW),
                        )
                }
            )
            .build()

    @Test
    fun `GIVEN onboarding was never completed WHEN scheduling THEN no work is enqueued`() = runTest {
        settings.onboardingCompletedTimestamp = -1L

        schedule(testContext, settings)

        val workExists =
            WorkManager.getInstance(testContext)
                .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                .await()
                .isNotEmpty()
        assertFalse(workExists)
    }

    @Test
    fun `GIVEN onboarding was completed WHEN scheduling THEN work is enqueued`() = runTest {
        settings.onboardingCompletedTimestamp = 1_000L

        schedule(testContext, settings, FakeDateTimeProvider(currentTime = SCHEDULING_FAKE_NOW))

        val workExists =
            WorkManager.getInstance(testContext)
                .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                .await()
                .isNotEmpty()
        assertTrue(workExists)
    }

    @Test
    fun `GIVEN work is scheduled WHEN cancelled THEN its state becomes cancelled`() = runTest {
        settings.onboardingCompletedTimestamp = 1_000L
        schedule(testContext, settings, FakeDateTimeProvider(currentTime = SCHEDULING_FAKE_NOW))

        cancel(testContext)

        val state =
            WorkManager.getInstance(testContext)
                .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                .await()
                .first()
                .state
        assertEquals(WorkInfo.State.CANCELLED, state)
    }

    @Test
    fun `GIVEN tracking protection is disabled WHEN doWork runs THEN no tracker count is fetched`() = runTest {
        settings.shouldUseTrackingProtection = false

        val worker = buildWorker()
        val result = worker.doWork()

        assertEquals(Result.success(), result)
        assertEquals(0, fakeEngine.fetchTrackingEventsCallCount)
    }

    @Test
    fun `GIVEN blocked trackers meets the notification threshold WHEN doWork runs THEN it fetches exactly the past 7 days and shows the notification`() =
        runTest {
            settings.shouldUseTrackingProtection = true
            fakeEngine.trackingEventsResult =
                listOf(
                    TrackingProtectionEvent(type = TRACKERS, count = 20, date = null),
                    TrackingProtectionEvent(type = TRACKERS, count = 28, date = null),
                )

            val worker = buildWorker()
            val resultDeferred = async { worker.doWork() }
            testScheduler.runCurrent()
            shadowOf(Looper.getMainLooper()).idle()

            assertEquals(Result.success(), resultDeferred.await())
            assertEquals(NOW - TimeUnit.DAYS.toMillis(7), fakeEngine.lastDateFrom)
            assertEquals(NOW, fakeEngine.lastDateTo)
        }

    @Test
    fun `GIVEN blocked trackers is below the notification threshold WHEN doWork runs THEN trackers are fetched and the no-trackers notification is shown`() =
        runTest {
            settings.shouldUseTrackingProtection = true
            fakeEngine.trackingEventsResult = listOf(TrackingProtectionEvent(type = TRACKERS, count = 47, date = null))

            val worker = buildWorker()
            val resultDeferred = async { worker.doWork() }
            testScheduler.runCurrent()
            shadowOf(Looper.getMainLooper()).idle()

            assertEquals(Result.success(), resultDeferred.await())
            assertEquals(1, fakeEngine.fetchTrackingEventsCallCount)
        }
}

/**
 * A [FakeEngine] whose tracking-events fetch is controllable and records what it was called with, so tests can assert
 * on the requested date range without mocking [Engine].
 */
private class ControllableFakeEngine(private val delegate: Engine = FakeEngine()) : Engine by delegate {
    var trackingEventsResult: List<TrackingProtectionEvent> = emptyList()
    var lastDateFrom: Long? = null
    var lastDateTo: Long? = null
    var fetchTrackingEventsCallCount = 0
        private set

    override fun getTrackingProtectionEventsByDateRange(
        dateFrom: Long,
        dateTo: Long,
        onSuccess: (List<TrackingProtectionEvent>) -> Unit,
        onError: (Throwable) -> Unit,
    ) {
        fetchTrackingEventsCallCount++
        lastDateFrom = dateFrom
        lastDateTo = dateTo
        onSuccess(trackingEventsResult)
    }
}
