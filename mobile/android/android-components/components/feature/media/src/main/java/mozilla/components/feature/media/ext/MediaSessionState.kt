/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.ext

import android.support.v4.media.session.PlaybackStateCompat
import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.feature.media.MediaNimbus

/**
 * The number of milliseconds in a second, used to convert the seconds-based media session
 * positions to the milliseconds expected by [PlaybackStateCompat].
 */
internal const val MS_PER_SECOND = 1000.0

/**
 * Turns the [MediaSessionState] into a [PlaybackStateCompat] to be used with a `MediaSession`.
 *
 * @param resetPosition when true, reports a position of 0 instead of the value from [positionState].
 */
internal fun MediaSessionState.toPlaybackState(resetPosition: Boolean = false): PlaybackStateCompat {
    val improvementsEnabled = MediaNimbus.features.mediaNotificationImprovements.value().enabled
    return PlaybackStateCompat.Builder()
        .setActions(playbackActions(improvementsEnabled))
        .setState(
            playbackStateCompat(),
            playbackPositionMs(improvementsEnabled, resetPosition),
            playbackSpeed(improvementsEnabled),
        )
        .build()
}

private fun MediaSessionState.playbackActions(improvementsEnabled: Boolean): Long {
    var actions = PlaybackStateCompat.ACTION_PLAY_PAUSE or
        PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE
    if (!improvementsEnabled) {
        return actions
    }
    if (features.contains(MediaSession.Feature.NEXT_TRACK)) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
    }
    if (features.contains(MediaSession.Feature.PREVIOUS_TRACK)) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    }
    val hasDuration = positionState.duration > 0 || (elementMetadata?.duration ?: -1.0) > 0
    if (hasDuration || features.contains(MediaSession.Feature.SEEK_TO)) {
        actions = actions or PlaybackStateCompat.ACTION_SEEK_TO
    }
    return actions
}

private fun MediaSessionState.playbackStateCompat(): Int = when (playbackState) {
    MediaSession.PlaybackState.PLAYING -> PlaybackStateCompat.STATE_PLAYING
    MediaSession.PlaybackState.PAUSED -> PlaybackStateCompat.STATE_PAUSED
    else -> PlaybackStateCompat.STATE_NONE
}

private fun MediaSessionState.playbackPositionMs(improvementsEnabled: Boolean, resetPosition: Boolean): Long =
    when {
        !improvementsEnabled -> PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN
        resetPosition -> 0L
        else -> (positionState.position * MS_PER_SECOND).toLong()
    }

private fun MediaSessionState.playbackSpeed(improvementsEnabled: Boolean): Float = when {
    playbackState != MediaSession.PlaybackState.PLAYING -> 0.0f
    !improvementsEnabled -> 1.0f
    else -> positionState.playbackRate.toFloat().takeIf { it != 0f } ?: 1.0f
}

/**
 * If this state is [MediaSession.PlaybackState.PLAYING] then return true, else return false.
 */
fun MediaSessionState.playing(): Boolean {
    return when (playbackState) {
        MediaSession.PlaybackState.PLAYING -> true
        else -> false
    }
}
