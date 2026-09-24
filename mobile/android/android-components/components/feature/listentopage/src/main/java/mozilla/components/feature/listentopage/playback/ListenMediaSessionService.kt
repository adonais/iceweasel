/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

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

    private var listenPlayer: ListenPlayer? = null
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()

        val player = ListenPlayer(this)
        listenPlayer = player
        mediaSession = MediaSession.Builder(this, player.exoPlayer).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null

        listenPlayer?.release()
        listenPlayer = null

        super.onDestroy()
    }
}
