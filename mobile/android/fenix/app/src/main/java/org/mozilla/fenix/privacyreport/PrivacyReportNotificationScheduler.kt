/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.Context
import androidx.annotation.VisibleForTesting
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import mozilla.components.support.base.ext.isNotificationChannelEnabled
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.DefaultDateTimeProvider
import org.mozilla.fenix.utils.Settings

/**
 * Schedules the [PrivacyReportNotificationWorker] based on the user's privacy report settings and notification
 * permissions.
 *
 * This scheduler observes the host lifecycle and re-evaluates whether the worker should be scheduled whenever the host
 * resumes.
 */
class PrivacyReportNotificationScheduler(
    private val applicationContext: Context,
    private val settings: Settings,
) : DefaultLifecycleObserver {

    override fun onResume(owner: LifecycleOwner) {
        super.onResume(owner)

        updatePrivacyReportNotificationWorker()
    }

    /**
     * Register the [PrivacyReportNotificationWorker]'s notification channel if the feature is enabled and app
     * notifications are allowed, then schedule or cancel the worker based on whether the feature is enabled and that
     * channel is enabled.
     *
     * @param dateTimeProvider Used to compute the worker's initial delay when scheduling. Overridable so tests can
     *   control the resulting delay instead of it being computed against the real clock, which could otherwise be zero
     *   and cause WorkManager's test harness to actually execute the worker.
     */
    @VisibleForTesting
    internal fun updatePrivacyReportNotificationWorker(dateTimeProvider: DateTimeProvider = DefaultDateTimeProvider()) {
        // If the tracking protection feature is disabled then don't schedule the notification.
        if (!settings.shouldUseTrackingProtection) {
            PrivacyReportNotificationWorker.cancel(applicationContext)
            return
        }

        val notificationManager = NotificationManagerCompat.from(applicationContext)
        val featureEnabled = settings.weeklyPrivacyNotificationFeatureFlagEnabled

        if (featureEnabled && notificationManager.areNotificationsEnabled()) {
            // Register the channel so that it appears in the Android Settings App even
            // before the first notification is sent.
            ensurePrivacyReportNotificationChannelExists(applicationContext)
        }

        val shouldSchedule =
            featureEnabled && notificationManager.isNotificationChannelEnabled(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID)

        if (shouldSchedule) {
            PrivacyReportNotificationWorker.schedule(applicationContext, settings, dateTimeProvider)
        } else {
            PrivacyReportNotificationWorker.cancel(applicationContext)
        }
    }
}
