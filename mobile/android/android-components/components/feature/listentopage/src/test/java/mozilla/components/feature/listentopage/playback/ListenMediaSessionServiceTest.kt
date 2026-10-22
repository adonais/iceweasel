/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.app.Service
import android.content.Intent
import android.os.Looper
import android.view.KeyEvent
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaNotification
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.whenever
import mozilla.components.ui.icons.R as iconsR
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
        val controls = notificationControls(testContext.resources, PlaybackSpeed.Default)

        assertEquals(
            listOf(Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD),
            controls.take(2).map { it.playerCommand },
        )
    }

    @Test
    fun `test that the skip controls say and show how far they move`() {
        val controls = notificationControls(testContext.resources, PlaybackSpeed.Default)

        assertEquals("Back 10 seconds", controls.first().displayName.toString())
        assertEquals(CommandButton.ICON_SKIP_BACK_10, controls.first().icon)
        assertEquals("Forward 30 seconds", controls[1].displayName.toString())
        assertEquals(CommandButton.ICON_SKIP_FORWARD_30, controls[1].icon)
    }

    @OptIn(UnstableApi::class)
    @Test
    fun `test that the speed control sits right of the forward control`() {
        val speed = notificationControls(testContext.resources, PlaybackSpeed.Default).last()

        assertEquals(ACTION_CYCLE_SPEED, speed.sessionCommand?.customAction)
        assertEquals(
            listOf(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW),
            speed.slots.asList(),
        )
    }

    @Test
    fun `test that the speed control says and shows the speed that is on`() {
        val speed = notificationControls(testContext.resources, PlaybackSpeed.X1_5).last()

        assertEquals("Playback rate 50 percent faster", speed.displayName.toString())
        assertEquals(iconsR.drawable.mozac_ic_playback_speed_1_5x_24, speed.iconResId)
    }

    @Test
    fun `test that a speed too precise for its icon is still said in full`() {
        val speed = notificationControls(testContext.resources, PlaybackSpeed.X1_25).last()

        assertEquals("Playback rate 25 percent faster", speed.displayName.toString())
        assertEquals(iconsR.drawable.mozac_ic_playback_speed_1_2x_24, speed.iconResId)
    }

    @Test
    fun `test that the speed control shows our icons rather than those of media3`() {
        val speed = notificationControls(testContext.resources, PlaybackSpeed.Default).last()

        assertEquals(CommandButton.ICON_UNDEFINED, speed.icon)
    }

    @Test
    fun `test that the speed of the voice itself is said in words rather than as a multiple`() {
        val speed = notificationControls(testContext.resources, PlaybackSpeed.X1).last()

        assertEquals("Playback speed normal", speed.displayName.toString())
    }

    @Test
    fun `test that every speed is said as itself`() {
        val said =
            PlaybackSpeed.entries.map { speed ->
                notificationControls(testContext.resources, speed).last().displayName.toString()
            }

        assertEquals(PlaybackSpeed.entries.size, said.toSet().size)
    }

    @OptIn(UnstableApi::class)
    @Test
    fun `test that the speed control shows a speed set from outside the notification`() {
        val controller = Robolectric.buildService(ListenMediaSessionService::class.java).create()
        val session = controller.get().onGetSession(mock())!!

        session.player.setPlaybackSpeed(PlaybackSpeed.X0_5.multiplier)
        shadowOf(Looper.getMainLooper()).idle()

        val speed = session.mediaButtonPreferences.last()
        controller.destroy()
        assertEquals("Playback set to half speed", speed.displayName.toString())
        assertEquals(iconsR.drawable.mozac_ic_playback_speed_0_5x_24, speed.iconResId)
    }

    @Test
    fun `test that the speed control steps the player on from whatever speed it is at`() {
        assertEquals(PlaybackSpeed.X1_5, playerAt(1.3f).nextSpeed())
    }

    @Test
    fun `test that the speed control wraps round to the slowest speed`() {
        assertEquals(PlaybackSpeed.X0_25, playerAt(2f).nextSpeed())
    }

    private fun playerAt(speed: Float): Player = mock {
        whenever(this.playbackParameters).thenReturn(PlaybackParameters(speed))
    }

    private fun mediaButton() =
        Intent(Intent.ACTION_MEDIA_BUTTON)
            .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_STOP))
}
