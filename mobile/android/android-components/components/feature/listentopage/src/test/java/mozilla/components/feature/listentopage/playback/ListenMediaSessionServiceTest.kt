/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.app.Service
import android.content.Intent
import android.view.KeyEvent
import androidx.media3.common.Player
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaNotification
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf

@RunWith(AndroidJUnit4::class)
class ListenMediaSessionServiceTest {

    @Test
    fun `test that swiping the app out of the recents list ends the service`() {
        val service = Robolectric.buildService(ListenMediaSessionService::class.java).create().get()

        service.onTaskRemoved(null)

        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test
    fun `test that the service ends rather than come back from being killed with nothing to play`() {
        val service = Robolectric.buildService(ListenMediaSessionService::class.java).create().get()

        val restart = service.onStartCommand(null, 0, 1)

        assertEquals(Service.START_NOT_STICKY, restart)
        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test
    fun `test that dismissing the notification ends the service`() {
        val service = Robolectric.buildService(ListenMediaSessionService::class.java).create().get()
        val dismissal = mediaButton().putExtra(MediaNotification.NOTIFICATION_DISMISSED_EVENT_KEY, true)

        service.onStartCommand(dismissal, 0, 1)

        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test
    fun `test that a notification control leaves the service running`() {
        val service = Robolectric.buildService(ListenMediaSessionService::class.java).create().get()

        service.onStartCommand(mediaButton(), 0, 1)

        assertFalse(shadowOf(service).isStoppedBySelf)
    }

    @Test
    fun `test that the delete intent of the notification is read as a dismissal`() {
        val dismissal = mediaButton().putExtra(MediaNotification.NOTIFICATION_DISMISSED_EVENT_KEY, true)

        assertTrue(dismissal.isNotificationDismissal())
    }

    @Test
    fun `test that the notification skips by time rather than by chunk`() {
        val controls = skipControls(testContext.resources)

        assertEquals(
            listOf(Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD),
            controls.map { it.playerCommand },
        )
    }

    @Test
    fun `test that the skip controls say and show how far they move`() {
        val controls = skipControls(testContext.resources)

        assertEquals("Back 10 seconds", controls.first().displayName.toString())
        assertEquals(CommandButton.ICON_SKIP_BACK_10, controls.first().icon)
        assertEquals("Forward 30 seconds", controls.last().displayName.toString())
        assertEquals(CommandButton.ICON_SKIP_FORWARD_30, controls.last().icon)
    }

    private fun mediaButton() =
        Intent(Intent.ACTION_MEDIA_BUTTON)
            .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_STOP))
}
