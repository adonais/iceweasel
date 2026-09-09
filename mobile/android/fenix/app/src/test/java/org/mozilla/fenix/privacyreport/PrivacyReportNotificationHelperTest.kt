/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.net.toUri
import kotlin.test.assertNotNull
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.BuildConfig
import org.mozilla.fenix.R
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class PrivacyReportNotificationHelperTest {

    private lateinit var notificationsDelegate: NotificationsDelegate

    @Before
    fun setUp() {
        notificationsDelegate = NotificationsDelegate(NotificationManagerCompat.from(testContext))
    }

    @Test
    fun `WHEN ensurePrivacyReportNotificationChannelExists is called THEN the channel is created`() {
        val notificationManager = testContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        assertNull(notificationManager.getNotificationChannel(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID))

        val channelId = ensurePrivacyReportNotificationChannelExists(testContext)

        assertEquals(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID, channelId)
        assertNotNull(notificationManager.getNotificationChannel(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID))
    }

    @Test
    fun `GIVEN the channel already exists WHEN ensurePrivacyReportNotificationChannelExists is called THEN it is not recreated`() {
        ensurePrivacyReportNotificationChannelExists(testContext)
        val notificationManager = testContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = notificationManager.getNotificationChannel(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID)

        ensurePrivacyReportNotificationChannelExists(testContext)

        assertEquals(channel, notificationManager.getNotificationChannel(PRIVACY_REPORT_NOTIFICATION_CHANNEL_ID))
    }

    @Test
    fun `WHEN showPrivacyReportNotification is called THEN a notification is shown with click and dismiss intents`() {
        showPrivacyReportNotification(testContext, notificationsDelegate, trackersBlockedCount = 5)

        val notificationManager = testContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notifications = shadowOf(notificationManager).allNotifications
        assertEquals(1, notifications.size)
        val notification = notifications.first()
        assertNotNull(notification.contentIntent)
        assertNotNull(notification.deleteIntent)
    }

    @Test
    fun `WHEN showPrivacyReportNotification is called with no trackersBlockedCount THEN the no-trackers headline is shown with no body text`() {
        showPrivacyReportNotification(testContext, notificationsDelegate)

        val notificationManager = testContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = shadowOf(notificationManager).allNotifications.first()

        val expectedTitle =
            testContext.getString(
                R.string.notification_privacy_report_headline_no_trackers,
                testContext.getString(R.string.app_name),
            )
        assertEquals(expectedTitle, shadowOf(notification).contentTitle)
        assertEquals("", shadowOf(notification).contentText)
    }

    @Test
    fun `WHEN showPrivacyReportNotification is called THEN the click intent opens the deep link directly and the dismiss intent targets the receiver`() {
        showPrivacyReportNotification(testContext, notificationsDelegate, trackersBlockedCount = 5)

        val notificationManager = testContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = shadowOf(notificationManager).allNotifications.first()

        val clickIntent = shadowOf(notification.contentIntent).savedIntent
        assertEquals(Intent.ACTION_VIEW, clickIntent.action)
        assertEquals("${BuildConfig.DEEP_LINK_SCHEME}://privacy_report".toUri(), clickIntent.data)

        val dismissIntent = shadowOf(notification.deleteIntent).savedIntent
        assertEquals(ComponentName(testContext, PrivacyReportNotificationReceiver::class.java), dismissIntent.component)
        assertEquals(ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED, dismissIntent.action)
    }
}
