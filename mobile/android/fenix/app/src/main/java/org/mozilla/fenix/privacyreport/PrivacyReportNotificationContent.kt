/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.Context
import org.mozilla.fenix.R

/**
 * The content to display in the weekly privacy report notification.
 *
 * @property title The notification's title.
 * @property text The notification's body text.
 */
data class PrivacyReportNotificationContent(
    val title: String,
    val text: String,
) {

    companion object {
        /**
         * Content reporting how many trackers were blocked over the past week.
         *
         * @param context The context used to access the string resources.
         * @param trackersBlockedCount The number of trackers that were blocked over the past week.
         */
        fun trackersBlocked(context: Context, trackersBlockedCount: Int) =
            PrivacyReportNotificationContent(
                title =
                    context.resources.getQuantityString(
                        R.plurals.trackers_blocked_panel_num_trackers_blocked_this_week_2,
                        trackersBlockedCount,
                        trackersBlockedCount,
                    ),
                text =
                    context.getString(
                        R.string.notification_privacy_report_body_has_trackers,
                        context.getString(R.string.app_name),
                    ),
            )

        /**
         * Content introducing the feature, shown when not enough trackers were blocked over the past week to report a
         * count.
         *
         * @param context The context used to access the string resources.
         */
        fun noTrackersBlocked(context: Context) =
            PrivacyReportNotificationContent(
                title =
                    context.getString(
                        R.string.notification_privacy_report_headline_no_trackers,
                        context.getString(R.string.app_name),
                    ),
                text = "",
            )
    }
}
