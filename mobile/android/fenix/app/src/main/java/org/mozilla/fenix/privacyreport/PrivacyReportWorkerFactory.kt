/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import org.mozilla.fenix.utils.Settings

/**
 * [WorkerFactory] that constructs [PrivacyReportNotificationWorker] with its real dependencies.
 *
 * @param settings Used to check whether tracking protection is enabled.
 * @param trackingProtectionUseCases Used to fetch the past week's blocked trackers.
 * @param notificationsDelegate Used to request notification permission and post the notification.
 */
class PrivacyReportWorkerFactory(
    private val settings: Settings,
    private val trackingProtectionUseCases: TrackingProtectionUseCases,
    private val notificationsDelegate: NotificationsDelegate,
) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? =
        when (workerClassName) {
            PrivacyReportNotificationWorker::class.java.name ->
                PrivacyReportNotificationWorker(
                    appContext,
                    workerParameters,
                    settings,
                    trackingProtectionUseCases,
                    notificationsDelegate,
                )
            else -> null
        }
}
