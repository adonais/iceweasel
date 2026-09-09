/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.base.ids.SharedIdsHelper
import org.mozilla.fenix.BuildConfig
import org.mozilla.fenix.R
import org.mozilla.fenix.utils.IntentUtils
import org.mozilla.fenix.utils.createBaseNotification

const val PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID = "org.mozilla.fenix.privacyreport.channel"

private const val PRIVACY_REPORT_NOTIFICATION_TAG = "org.mozilla.fenix.privacyreport.tag"
private const val PRIVACY_REPORT_PENDING_INTENT_TAG = "org.mozilla.fenix.privacyreport.pending_intent"

/**
 * Ensures that the notification channel for the weekly privacy report exists, creating it if necessary, and returns its
 * ID.
 *
 * @param context Used to access the [NotificationManager] system service and required string resources.
 *
 * **Note:** If the privacy report becomes a permanent feature, this will be refactored to inject the notification
 * manager through an abstraction, removing the direct dependency on [NotificationManager].
 *
 * See https://bugzilla.mozilla.org/show_bug.cgi?id=2062560.
 *
 * @return the channel ID to be used for notifications.
 */
fun ensurePrivacyReportNotificationChannelExists(context: Context): String {
    val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    val channel =
        notificationManager.getNotificationChannel(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID)
            ?: NotificationChannel(
                    PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID,
                    context.getString(R.string.notification_privacy_report_channel_name),
                    NotificationManager.IMPORTANCE_DEFAULT,
                )
                .apply {
                    description =
                        context.getString(
                            R.string.notification_privacy_report_channel_description,
                            context.getString(R.string.app_name),
                        )
                }

    notificationManager.createNotificationChannel(channel)

    return PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID
}

/**
 * Build and display the weekly privacy report notification. When [trackersBlockedCount] is `null`, meaning too few
 * trackers were blocked to meet the reporting threshold, the notification introduces the feature instead of reporting a
 * count.
 *
 * @param context Used to look up the [NotificationManager] system service and required string resources.
 * @param notificationsDelegate Used to request notification permission and post the notification.
 * @param trackersBlockedCount The number of trackers that were blocked over the past week, or `null` if that was below
 *   the reporting threshold.
 */
fun showPrivacyReportNotification(
    context: Context,
    notificationsDelegate: NotificationsDelegate,
    trackersBlockedCount: Int? = null,
) {
    notificationsDelegate.notify(
        PRIVACY_REPORT_NOTIFICATION_TAG,
        SharedIdsHelper.getIdForTag(context, PRIVACY_REPORT_NOTIFICATION_TAG),
        buildPrivacyReportNotification(context, trackersBlockedCount),
    )
}

private fun buildPrivacyReportNotification(context: Context, trackersBlockedCount: Int?): Notification {
    val title: String
    val text: String
    if (trackersBlockedCount != null) {
        title =
            context.resources.getQuantityString(
                R.plurals.trackers_blocked_panel_num_trackers_blocked_this_week_2,
                trackersBlockedCount,
                trackersBlockedCount,
            )
        text =
            context.getString(
                R.string.notification_privacy_report_body_has_trackers,
                context.getString(R.string.app_name),
            )
    } else {
        title =
            context.getString(
                R.string.notification_privacy_report_headline_no_trackers,
                context.getString(R.string.app_name),
            )
        text = ""
    }

    return createBaseNotification(
        context = context,
        channelId = ensurePrivacyReportNotificationChannelExists(context),
        title = title,
        text = text,
        onClick = createClickPendingIntent(context),
        onDismiss = createDismissPendingIntent(context),
    )
}

/**
 * The click action launches the deep link activity directly, via [PendingIntent.getActivity], rather than routing
 * through [PrivacyReportNotificationReceiver]. A broadcast receiver that calls `startActivity` in response to a
 * notification tap is a "notification trampoline", which Android discourages as background-activity-launch territory
 * and may stop working in a future release. See https://developer.android.com/guide/components/activities/secure-bal.
 */
private fun createClickPendingIntent(context: Context): PendingIntent {
    val intent =
        Intent(
                Intent.ACTION_VIEW,
                "${BuildConfig.DEEP_LINK_SCHEME}://privacy_report".toUri(),
            )
            .apply {
                setPackage(context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }

    return PendingIntent.getActivity(
        context,
        SharedIdsHelper.getNextIdForTag(context, PRIVACY_REPORT_PENDING_INTENT_TAG),
        intent,
        IntentUtils.DEFAULT_PENDING_INTENT_FLAGS,
    )
}

private fun createDismissPendingIntent(context: Context): PendingIntent {
    val intent =
        Intent(context, PrivacyReportNotificationReceiver::class.java)
            .setAction(ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED)

    return PendingIntent.getBroadcast(
        context,
        SharedIdsHelper.getNextIdForTag(context, PRIVACY_REPORT_PENDING_INTENT_TAG),
        intent,
        IntentUtils.DEFAULT_PENDING_INTENT_FLAGS,
    )
}
