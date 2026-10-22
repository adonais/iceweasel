/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Intent
import android.content.res.Resources
import android.os.Build
import android.os.Bundle
import androidx.annotation.DrawableRes
import androidx.annotation.OptIn
import androidx.annotation.PluralsRes
import androidx.annotation.RequiresApi
import androidx.annotation.StringRes
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaNotification
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import mozilla.components.feature.listentopage.PlaybackSpeed
import mozilla.components.feature.listentopage.R
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.ui.icons.R as iconsR

/**
 * Owns the [ListenPlayer] that reads an article out loud.
 *
 * The service owns the player, and no caller does, because the audio has to keep playing when the app is not on screen.
 * A player held by a view or a fragment cannot outlive it.
 *
 * Media3 promotes this service to the foreground and publishes the playback notification whenever playback is commanded
 * through the session. That is why [ListenPlaybackController] is the only way in: driving the player directly loses
 * both the notification and the background audio, and it fails silently.
 */
internal class ListenMediaSessionService : MediaSessionService() {

    private val logger = Logger("ListenMediaSessionService")

    private var listenPlayer: ListenPlayer? = null
    private var mediaSession: MediaSession? = null

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()

        val player = ListenPlayer(this)
        listenPlayer = player
        mediaSession =
            MediaSession.Builder(this, player.exoPlayer)
                .setMediaButtonPreferences(notificationControls(resources, PlaybackSpeed.Default))
                .setCallback(PlaybackSpeedCallback())
                .build()
        player.exoPlayer.addListener(
            object : Player.Listener {
                // The control carries the icon of the speed that is on, so it is republished whatever changed the
                // speed: the notification control, or the player sheet through the controller.
                override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
                    mediaSession?.setMediaButtonPreferences(
                        notificationControls(resources, PlaybackSpeed.nearest(playbackParameters.speed))
                    )
                }
            }
        )

        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().apply {
                setSmallIcon(iconsR.drawable.mozac_ic_logo_firefox_24)
            }
        )

        setShowNotificationForIdlePlayer(SHOW_NOTIFICATION_FOR_IDLE_PLAYER_NEVER)

        setListener(
            object : Listener {
                @RequiresApi(Build.VERSION_CODES.S)
                override fun onForegroundServiceStartNotAllowedException() {
                    logger.warn("Refused the foreground, so playback cannot be started from the background")
                    endPlayback()
                }
            }
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val started = super.onStartCommand(intent, flags, startId)

        if (intent == null || intent.isNotificationDismissal()) {
            endPlayback()
            return START_NOT_STICKY
        }

        return started
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        endPlayback()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        releasePlayback()
        super.onDestroy()
    }

    /** Pauses the reading, takes the notification away and ends the service */
    @OptIn(UnstableApi::class)
    private fun endPlayback() {
        pauseAllPlayersAndStopSelf()
        releasePlayback()
    }

    private fun releasePlayback() {
        mediaSession?.release()
        mediaSession = null

        listenPlayer?.release()
        listenPlayer = null
    }
}

/** Grants the speed control its command and does what the control asks. */
private class PlaybackSpeedCallback : MediaSession.Callback {

    @OptIn(UnstableApi::class)
    override fun onConnect(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult {
        val granted = MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller).build()
        val cycleSpeedCommand = SessionCommand(ACTION_CYCLE_SPEED, Bundle.EMPTY)

        return MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller)
            .setAvailableSessionCommands(granted.availableSessionCommands.buildUpon().add(cycleSpeedCommand).build())
            .build()
    }

    @OptIn(UnstableApi::class)
    override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle,
    ): ListenableFuture<SessionResult> {
        if (customCommand.customAction != ACTION_CYCLE_SPEED) {
            return super.onCustomCommand(session, controller, customCommand, args)
        }

        session.player.setPlaybackSpeed(session.player.nextSpeed().multiplier)

        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }
}

/** The step the speed control moves this player on to. */
internal fun Player.nextSpeed(): PlaybackSpeed = PlaybackSpeed.nearest(playbackParameters.speed).next()

/**
 * The controls of the playback notification and the lock screen, in the order they are shown.
 *
 * @param resources Used to label the controls.
 * @param speed The speed the playback is at.
 */
internal fun notificationControls(resources: Resources, speed: PlaybackSpeed): List<CommandButton> =
    listOf(
        CommandButton.Builder(CommandButton.ICON_SKIP_BACK_10)
            .setPlayerCommand(Player.COMMAND_SEEK_BACK)
            .setDisplayName(
                secondsLabel(
                    resources,
                    R.plurals.mozac_feature_listentopage_notification_skip_back,
                    SEEK_BACK_INCREMENT_MS,
                )
            )
            .build(),
        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_30)
            .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
            .setDisplayName(
                secondsLabel(
                    resources,
                    R.plurals.mozac_feature_listentopage_notification_skip_forward,
                    SEEK_FORWARD_INCREMENT_MS,
                )
            )
            .build(),
        speedControl(resources, speed),
    )

/**
 * The control that steps the reading speed on.
 *
 * Media3 has no player command to cycle through a list of playback speeds, so it carries a command of ours. The
 * notification only has room for three controls when it is collapsed, so this one is seen once it is expanded.
 */
@OptIn(UnstableApi::class)
private fun speedControl(resources: Resources, speed: PlaybackSpeed): CommandButton =
    CommandButton.Builder(CommandButton.ICON_UNDEFINED)
        .setCustomIconResId(speed.icon)
        .setSessionCommand(SessionCommand(ACTION_CYCLE_SPEED, Bundle.EMPTY))
        .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
        .setDisplayName(resources.getString(speed.contentDescription))
        .build()

/** What a screen reader says for this step. */
@get:StringRes
internal val PlaybackSpeed.contentDescription: Int
    get() =
        when (this) {
            PlaybackSpeed.X0_25 -> R.string.mozac_feature_listentopage_notification_playback_speed_0_25
            PlaybackSpeed.X0_5 -> R.string.mozac_feature_listentopage_notification_playback_speed_0_5
            PlaybackSpeed.X0_75 -> R.string.mozac_feature_listentopage_notification_playback_speed_0_75
            PlaybackSpeed.X1 -> R.string.mozac_feature_listentopage_notification_playback_speed_1
            PlaybackSpeed.X1_25 -> R.string.mozac_feature_listentopage_notification_playback_speed_1_25
            PlaybackSpeed.X1_5 -> R.string.mozac_feature_listentopage_notification_playback_speed_1_5
            PlaybackSpeed.X1_75 -> R.string.mozac_feature_listentopage_notification_playback_speed_1_75
            PlaybackSpeed.X2 -> R.string.mozac_feature_listentopage_notification_playback_speed_2
        }

@get:DrawableRes
internal val PlaybackSpeed.icon: Int
    get() =
        when (this) {
            PlaybackSpeed.X0_25 -> iconsR.drawable.mozac_ic_playback_speed_0_2x_24
            PlaybackSpeed.X0_5 -> iconsR.drawable.mozac_ic_playback_speed_0_5x_24
            PlaybackSpeed.X0_75 -> iconsR.drawable.mozac_ic_playback_speed_0_7x_24
            PlaybackSpeed.X1 -> iconsR.drawable.mozac_ic_playback_speed_1x_24
            PlaybackSpeed.X1_25 -> iconsR.drawable.mozac_ic_playback_speed_1_2x_24
            PlaybackSpeed.X1_5 -> iconsR.drawable.mozac_ic_playback_speed_1_5x_24
            PlaybackSpeed.X1_75 -> iconsR.drawable.mozac_ic_playback_speed_1_7x_24
            PlaybackSpeed.X2 -> iconsR.drawable.mozac_ic_playback_speed_2x_24
        }

/** The command the speed control sends, which no player command of media3's covers. */
internal const val ACTION_CYCLE_SPEED = "mozilla.components.feature.listentopage.CYCLE_SPEED"

private fun secondsLabel(resources: Resources, @PluralsRes label: Int, incrementMs: Long): String {
    val seconds = (incrementMs / MS_PER_SECOND).toInt()

    return resources.getQuantityString(label, seconds, seconds)
}

private const val MS_PER_SECOND = 1000L

/**
 * Media3 records the dismissal and stops republishing the notification, but it leaves the service running, so the
 * service has to read the same intent to know that it should end.
 */
@OptIn(UnstableApi::class)
internal fun Intent.isNotificationDismissal(): Boolean =
    getBooleanExtra(MediaNotification.NOTIFICATION_DISMISSED_EVENT_KEY, false)
