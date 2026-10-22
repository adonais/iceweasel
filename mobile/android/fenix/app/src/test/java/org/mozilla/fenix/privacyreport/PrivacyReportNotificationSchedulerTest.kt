/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.concurrent.futures.await
import androidx.core.app.NotificationManagerCompat
import androidx.work.Configuration
import androidx.work.DelegatingWorkerFactory
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import io.mockk.every
import io.mockk.mockk
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.test.fakes.engine.FakeEngine
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.FakeDateTimeProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.TrackingProtection
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.privacyreport.PrivacyReportNotificationAvailability.APP_NOTIFICATIONS_DISABLED
import org.mozilla.fenix.privacyreport.PrivacyReportNotificationAvailability.AVAILABLE
import org.mozilla.fenix.privacyreport.PrivacyReportNotificationAvailability.CHANNEL_DISABLED
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

private const val PRIVACY_REPORT_NOTIFICATION_WORK_NAME = "org.mozilla.fenix.privacyreport.work"

/**
 * Fake "now" used when scheduling the privacy report notification worker in these tests, matching
 * [Settings.onboardingCompletedTimestamp] so the computed initial delay is a full week away rather than ~0. A ~0 delay
 * would, combined with WorkManager's synchronous test executor, cause the worker to actually execute during what are
 * meant to be scheduling-only tests.
 */
private const val PRIVACY_REPORT_NOTIFICATION_FAKE_NOW = 1_000L

@RunWith(RobolectricTestRunner::class)
class PrivacyReportNotificationSchedulerTest {

    @get:Rule val gleanRule = FenixGleanTestRule(testContext)

    private lateinit var scheduler: PrivacyReportNotificationScheduler
    private lateinit var settings: Settings

    @Before
    fun setup() {
        settings = mockk(relaxed = true)

        scheduler =
            PrivacyReportNotificationScheduler(
                applicationContext = testContext,
                settings = settings,
            )

        // The default WorkManager instance doesn't go through FenixApplication's
        // Configuration.Provider in this test environment, so scheduling the
        // PrivacyReportNotificationWorker needs its own WorkerFactory wiring to be able to
        // actually construct the worker.
        val workerFactoryConfiguration =
            Configuration.Builder()
                .setWorkerFactory(
                    DelegatingWorkerFactory().apply {
                        addFactory(
                            PrivacyReportWorkerFactory(
                                settings = Settings(testContext),
                                trackingProtectionUseCases = TrackingProtectionUseCases(BrowserStore(), FakeEngine()),
                                notificationsDelegate =
                                    NotificationsDelegate(NotificationManagerCompat.from(testContext)),
                            )
                        )
                    }
                )
                .build()

        WorkManagerTestInitHelper.initializeTestWorkManager(
            testContext,
            workerFactoryConfiguration,
        )
    }

    @After
    fun teardown() {
        WorkManagerTestInitHelper.closeWorkDatabase()
    }

    @Test
    fun `GIVEN the privacy report notification feature is enabled and notifications are allowed WHEN updatePrivacyReportNotificationWorker is called THEN the worker is scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertTrue(workExists)
        }

    @Test
    fun `GIVEN tracking protection is disabled WHEN updatePrivacyReportNotificationWorker is called THEN the worker is not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns false
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker()

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertFalse(workExists)
        }

    @Test
    fun `GIVEN the worker was previously scheduled WHEN tracking protection becomes disabled THEN the worker is cancelled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            assertTrue(
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()
            )

            every { settings.shouldUseTrackingProtection } returns false

            scheduler.updatePrivacyReportNotificationWorker()

            val workInfos =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()

            assertTrue(workInfos.all { it.state == WorkInfo.State.CANCELLED })
        }

    @Test
    fun `GIVEN the privacy report notification feature is disabled WHEN updatePrivacyReportNotificationWorker is called THEN the worker is not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns false

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker()

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertFalse(workExists)
        }

    @Test
    fun `GIVEN notifications are not allowed WHEN updatePrivacyReportNotificationWorker is called THEN the worker is not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)

            scheduler.updatePrivacyReportNotificationWorker()

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertFalse(workExists)
        }

    @Test
    fun `GIVEN the privacy report notification channel is disabled WHEN updatePrivacyReportNotificationWorker is called THEN the worker is not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            testContext
                .getSystemService(NotificationManager::class.java)
                .createNotificationChannel(
                    NotificationChannel(
                        PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID,
                        "Privacy report",
                        NotificationManager.IMPORTANCE_NONE,
                    )
                )

            scheduler.updatePrivacyReportNotificationWorker()

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertFalse(workExists)
        }

    @Test
    fun `GIVEN onboarding is incomplete WHEN updatePrivacyReportNotificationWorker is called THEN the worker is not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns -1L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker()

            val workExists =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
                    .isNotEmpty()

            assertFalse(workExists)
        }

    @Test
    fun `GIVEN notifications become unavailable and then available again WHEN updatePrivacyReportNotificationWorker is called THEN the worker is rescheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            val notificationManager = shadowOf(testContext.getSystemService(NotificationManager::class.java))
            notificationManager.setNotificationsEnabled(true)

            // Initial call: worker is scheduled.
            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            val workInfosAfterScheduling =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()

            assertEquals(1, workInfosAfterScheduling.size)
            assertEquals(WorkInfo.State.ENQUEUED, workInfosAfterScheduling.single().state)

            val initialWorkId = workInfosAfterScheduling.single().id

            // Notifications disabled: worker is cancelled.
            notificationManager.setNotificationsEnabled(false)
            scheduler.updatePrivacyReportNotificationWorker()

            val workInfosAfterCancellation =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()

            assertTrue(workInfosAfterCancellation.all { it.state == WorkInfo.State.CANCELLED })

            // Notifications re-enabled: worker should be scheduled again.
            notificationManager.setNotificationsEnabled(true)
            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            val workInfosAfterRescheduling =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()

            assertEquals(1, workInfosAfterRescheduling.size)
            assertEquals(WorkInfo.State.ENQUEUED, workInfosAfterRescheduling.single().state)
            assertTrue(workInfosAfterRescheduling.single().id != initialWorkId)
        }

    @Test
    fun `GIVEN the worker is already scheduled WHEN updatePrivacyReportNotificationWorker is called again THEN the schedule is not recomputed`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L
            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            val firstProvider = CountingDateTimeProvider()
            scheduler.updatePrivacyReportNotificationWorker(dateTimeProvider = firstProvider)
            assertTrue(firstProvider.callCount > 0)

            val secondProvider = CountingDateTimeProvider()
            scheduler.updatePrivacyReportNotificationWorker(dateTimeProvider = secondProvider)
            assertEquals(0, secondProvider.callCount)

            val workInfos =
                WorkManager.getInstance(testContext)
                    .getWorkInfosForUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
                    .await()
            assertEquals(1, workInfos.size)
            assertEquals(WorkInfo.State.ENQUEUED, workInfos.single().state)
        }

    @Test
    fun `GIVEN the feature is enabled and notifications are allowed WHEN updatePrivacyReportNotificationWorker is called THEN notifications are reported as available`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            assertEquals(
                AVAILABLE.telemetryId,
                TrackingProtection.privacyReportNotificationAvailability.testGetValue(),
            )
        }

    @Test
    fun `GIVEN notifications are not allowed WHEN updatePrivacyReportNotificationWorker is called THEN the app-level opt-out is reported`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)

            scheduler.updatePrivacyReportNotificationWorker()

            assertEquals(
                APP_NOTIFICATIONS_DISABLED.telemetryId,
                TrackingProtection.privacyReportNotificationAvailability.testGetValue(),
            )
        }

    @Test
    fun `GIVEN the privacy report notification channel is disabled WHEN updatePrivacyReportNotificationWorker is called THEN the channel-level opt-out is reported`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            testContext
                .getSystemService(NotificationManager::class.java)
                .createNotificationChannel(
                    NotificationChannel(
                        PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID,
                        "Privacy report",
                        NotificationManager.IMPORTANCE_NONE,
                    )
                )

            scheduler.updatePrivacyReportNotificationWorker()

            assertEquals(
                CHANNEL_DISABLED.telemetryId,
                TrackingProtection.privacyReportNotificationAvailability.testGetValue(),
            )
        }

    @Test
    fun `GIVEN the feature is disabled WHEN updatePrivacyReportNotificationWorker is called THEN no availability is reported`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns false

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker()

            assertNull(TrackingProtection.privacyReportNotificationAvailability.testGetValue())
        }

    @Test
    fun `GIVEN tracking protection is disabled WHEN updatePrivacyReportNotificationWorker is called THEN no availability is reported`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns false
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker()

            assertNull(TrackingProtection.privacyReportNotificationAvailability.testGetValue())
        }

    @Test
    fun `GIVEN the feature is enabled and notifications are allowed WHEN updatePrivacyReportNotificationWorker is called THEN the worker is reported as scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns true
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true
            every { settings.onboardingCompletedTimestamp } returns 1_000L

            shadowOf(testContext.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)

            scheduler.updatePrivacyReportNotificationWorker(
                dateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
            )

            assertTrue(TrackingProtection.privacyReportNotificationWorkerScheduled.testGetValue()!!)
        }

    @Test
    fun `GIVEN tracking protection is disabled WHEN updatePrivacyReportNotificationWorker is called THEN the worker is reported as not scheduled`() =
        runTest {
            every { settings.shouldUseTrackingProtection } returns false
            every { settings.weeklyPrivacyNotificationFeatureFlagEnabled } returns true

            scheduler.updatePrivacyReportNotificationWorker()

            assertFalse(TrackingProtection.privacyReportNotificationWorkerScheduled.testGetValue()!!)
        }
}

private class CountingDateTimeProvider(
    private val delegate: DateTimeProvider = FakeDateTimeProvider(currentTime = PRIVACY_REPORT_NOTIFICATION_FAKE_NOW)
) : DateTimeProvider {
    var callCount = 0
        private set

    override fun currentLocalDate(): LocalDate = delegate.currentLocalDate().also { callCount++ }

    override fun currentZoneId(): ZoneId = delegate.currentZoneId().also { callCount++ }

    override fun currentTimeMillis(): Long = delegate.currentTimeMillis().also { callCount++ }
}
