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
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.test.fakes.engine.FakeEngine
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.utils.FakeDateTimeProvider
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
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
class PrivacyWorkerSchedulerTest {

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
}
