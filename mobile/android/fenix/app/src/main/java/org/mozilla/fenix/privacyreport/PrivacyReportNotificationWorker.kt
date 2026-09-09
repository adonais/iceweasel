/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.DefaultDateTimeProvider
import org.mozilla.fenix.utils.Settings

private const val PRIVACY_REPORT_NOTIFICATION_WORK_NAME = "org.mozilla.fenix.privacyreport.work"
private val WEEK_IN_MILLIS = TimeUnit.DAYS.toMillis(7)

/** Weekly blocked-tracker counts over this show the "trackers blocked" notification variant. */
private const val SHOW_NOTIFICATION_THRESHOLD = 47

/**
 * Background [CoroutineWorker] that shows the weekly privacy report notification, summarizing how many trackers were
 * blocked over the past week.
 *
 * Instantiated by [PrivacyReportWorkerFactory], not WorkManager's default reflective factory.
 *
 * @param applicationContext Setup parameter for [CoroutineWorker].
 * @param workerParameters Setup parameter for a [CoroutineWorker].
 * @param settings Used to check whether tracking protection is enabled.
 * @param trackingProtectionUseCases Used to fetch the past week's blocked trackers.
 * @param notificationsDelegate Used to request notification permission and post the notification.
 * @param dateTimeProvider Used to access the current time.
 */
class PrivacyReportNotificationWorker(
    applicationContext: Context,
    workerParameters: WorkerParameters,
    private val settings: Settings,
    private val trackingProtectionUseCases: TrackingProtectionUseCases,
    private val notificationsDelegate: NotificationsDelegate,
    private val dateTimeProvider: DateTimeProvider = DefaultDateTimeProvider(),
) : CoroutineWorker(applicationContext, workerParameters) {

    private val logger = Logger("PrivacyReportNotificationWorker")

    override suspend fun doWork(): Result {
        ensurePrivacyReportNotificationChannelExists(applicationContext)

        // Tracking protection could have been disabled since the worker was scheduled —
        // updatePrivacyReportNotificationWorker() only re-evaluates this on HomeActivity.onResume, so re-check here
        // before doing any work.
        if (settings.shouldUseTrackingProtection) {
            val trackersBlockedCount = fetchTrackersBlockedThisWeek()
            if (trackersBlockedCount > SHOW_NOTIFICATION_THRESHOLD) {
                showPrivacyReportNotification(applicationContext, notificationsDelegate, trackersBlockedCount)
            } else {
                showPrivacyReportNotification(applicationContext, notificationsDelegate)
            }
        }

        return Result.success()
    }

    private suspend fun fetchTrackersBlockedThisWeek(): Int {
        if (settings.debugForceWeeklyPrivacyReportNotification) {
            return SHOW_NOTIFICATION_THRESHOLD + 1
        }

        val now = dateTimeProvider.currentTimeMillis()
        val oneWeekAgo = now - WEEK_IN_MILLIS

        // fetchTrackingEvents queries Gecko's content-blocking database, which needs a Looper.
        return withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { continuation ->
                trackingProtectionUseCases.fetchTrackingEvents(
                    dateFrom = oneWeekAgo,
                    dateTo = now,
                    onSuccess = { events -> continuation.resume(events.sumOf { it.count }) },
                    onError = { error ->
                        logger.error("Failed to fetch tracking events for the privacy report notification", error)
                        continuation.resume(0)
                    },
                )
            }
        }
    }

    companion object {
        /**
         * Schedule the [PrivacyReportNotificationWorker] to run weekly, starting 7 days after onboarding completion.
         * Users who never completed onboarding have no timestamp to anchor to, so they're left out of this feature.
         */
        fun schedule(
            context: Context,
            settings: Settings,
            dateTimeProvider: DateTimeProvider = DefaultDateTimeProvider(),
        ) {
            val onboardingCompletedTimestamp = settings.onboardingCompletedTimestamp
            if (onboardingCompletedTimestamp < 0) {
                return
            }

            val oneWeekAfterOnboarding = onboardingCompletedTimestamp + WEEK_IN_MILLIS
            val now = dateTimeProvider.currentTimeMillis()
            // Ensure the initial delay is non-negative if a week has already passed.
            val initialDelay = (oneWeekAfterOnboarding - now).coerceAtLeast(0)

            val request =
                PeriodicWorkRequestBuilder<PrivacyReportNotificationWorker>(7, TimeUnit.DAYS)
                    .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                    .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    PRIVACY_REPORT_NOTIFICATION_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request,
                )
        }

        /** Cancel the [PrivacyReportNotificationWorker]. */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PRIVACY_REPORT_NOTIFICATION_WORK_NAME)
        }
    }
}
