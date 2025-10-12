/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components

/**
 * A foreground service that manages profiling notifications in the Firefox Android app.
 * Now uses NotificationsDelegate to handle permission requests and notification display.
 *
 * This service displays a persistent notification when profiling is active and provides
 * a way for users to stop profiling through the notification. The service handles starting
 * and stopping profiling operations based on intents, with the NotificationsDelegate managing
 * all permission-related logic.
 */
class ProfilerService : Service() {

    /**
     * Companion object containing constants and static functionality for the ProfilerService.
     * This object defines the intent actions that can be sent to the service to control
     * profiling operations.
     */
    companion object {
        const val ACTION_START_PROFILING = "mozilla.perf.action.START_PROFILING"
        const val ACTION_STOP_PROFILING = "mozilla.perf.action.STOP_PROFILING"
        const val PROFILING_CHANNEL_ID = "mozilla.perf.profiling"
        const val PROFILING_NOTIFICATION_ID = 99
        private const val REQUEST_CODE = 3
    }

    private val notificationsDelegate by lazy {
        components.notificationsDelegate
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_PROFILING -> {
                startProfilingWithNotification()
            }
            ACTION_STOP_PROFILING -> {
                stopForegroundCompat()
                stopSelf()
            }
            else -> {
                stopForegroundCompat()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    /**
     * Starts profiling with notification using NotificationsDelegate.
     * The delegate handles permission requests and notification display.
     */
    private fun startProfilingWithNotification() {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationsDelegate.requestNotificationPermission(
                onPermissionGranted = {
                    startForeground(PROFILING_NOTIFICATION_ID, notification)
                },
                showPermissionRationale = false,
            )
        } else {
            startForeground(PROFILING_NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundCompat() {
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun createNotificationChannel() {
        val profilingChannel = NotificationChannel(
            PROFILING_CHANNEL_ID,
            "App Profiling Status",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Shows when app profiling is active"
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
        }
        val notificationManager: NotificationManager =
            getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(profilingChannel)
    }

    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, StopProfilerActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntentFlags =
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val pendingIntent = PendingIntent.getActivity(
            this,
            REQUEST_CODE,
            notificationIntent,
            pendingIntentFlags,
        )

        val notificationBuilder = NotificationCompat.Builder(this, PROFILING_CHANNEL_ID)
            .setContentTitle(getString(R.string.profiler_active_notification))
            .setContentText(getString(R.string.profiler_notification_text))
            .setSmallIcon(R.drawable.ic_profiler)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            notificationBuilder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }

        return notificationBuilder.build()
    }

    override fun onBind(p0: Intent?): IBinder? {
        return null
    }
}
