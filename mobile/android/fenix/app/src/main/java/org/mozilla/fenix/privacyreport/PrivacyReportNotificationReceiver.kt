/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

internal const val ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED = "org.mozilla.fenix.privacyreport.DISMISSED"

/**
 * Handles the weekly privacy report notification's dismiss action.
 *
 * This is only intended to be used by the dismiss [android.app.PendingIntent] built in [showPrivacyReportNotification].
 * The click action launches the deep link activity directly instead of going through this receiver; see
 * [showPrivacyReportNotification] for why.
 */
class PrivacyReportNotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED) {
            // No-op for now; telemetry for this action is added in a later patch.
        }
    }
}
