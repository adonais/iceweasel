/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.focus

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.support.base.log.logger.Logger

/**
 * [AudioFocusController] implementation for Android API 26+.
 */
internal class AudioFocusControllerV26(
    private val audioManager: AudioManager,
    private val listener: AudioManager.OnAudioFocusChangeListener,
) : AudioFocusController {
    private val logger = Logger("AudioFocusControllerV26")
    private var lastRequest: AudioFocusRequest? = null

    override fun request(type: MediaSession.AudioSessionType): Int {
        val request = buildRequest(type)
        lastRequest = request
        return audioManager.requestAudioFocus(request)
    }

    override fun abandon() {
        lastRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    }

    /**
     * Shape the focus request after the audio-session [type] so other apps
     * react appropriately. The transient/transient-solo usage values are
     * best-fit choices pending validation with Android engineers (the audio
     * session plan's Open Item #4).
     */
    private fun buildRequest(type: MediaSession.AudioSessionType): AudioFocusRequest {
        val (gain, usage, contentType) = when (type) {
            MediaSession.AudioSessionType.PLAY_AND_RECORD -> Triple(
                AudioManager.AUDIOFOCUS_GAIN,
                AudioAttributes.USAGE_VOICE_COMMUNICATION,
                AudioAttributes.CONTENT_TYPE_SPEECH,
            )
            MediaSession.AudioSessionType.TRANSIENT_SOLO -> Triple(
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE,
                AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE,
                AudioAttributes.CONTENT_TYPE_SPEECH,
            )
            MediaSession.AudioSessionType.TRANSIENT -> Triple(
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
                AudioAttributes.USAGE_NOTIFICATION,
                AudioAttributes.CONTENT_TYPE_SONIFICATION,
            )
            // PLAYBACK, AMBIENT and AUTO use durable media-playback focus.
            // AMBIENT never reaches here: AudioFocus skips the request entirely
            // so ambient audio mixes freely.
            else -> Triple(
                AudioManager.AUDIOFOCUS_GAIN,
                AudioAttributes.USAGE_MEDIA,
                AudioAttributes.CONTENT_TYPE_MUSIC,
            )
        }
        logger.debug("buildRequest: type=$type gain=$gain usage=$usage contentType=$contentType")
        return AudioFocusRequest.Builder(gain)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(usage)
                    .setContentType(contentType)
                    .build(),
            )
            .setAcceptsDelayedFocusGain(true)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(listener)
            .build()
    }
}
