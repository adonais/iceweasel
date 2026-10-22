/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.session

import android.support.v4.media.session.MediaSessionCompat
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.media.ext.MS_PER_SECOND
import mozilla.components.feature.media.ext.findActiveMediaTab
import mozilla.components.support.base.log.logger.Logger

/**
 * @param onMediaSessionPlay Invoked with the active media tab when Play arrives through the media session. The tab is
 *   told to play only if it returns true.
 */
internal class MediaSessionCallback(
    private val store: BrowserStore,
    private val onMediaSessionPlay: (SessionState) -> Boolean,
) : MediaSessionCompat.Callback() {
    private val logger = Logger("MediaSessionCallback")

    override fun onPlay() {
        logger.debug("play()")

        store.state.findActiveMediaTab()?.let { tab ->
            if (onMediaSessionPlay(tab)) {
                tab.mediaSessionState?.controller?.play()
            }
        }
    }

    override fun onPause() {
        logger.debug("pause()")

        store.state.findActiveMediaTab()?.mediaSessionState?.controller?.pause()
    }

    override fun onSkipToNext() {
        logger.debug("nextTrack()")

        store.state.findActiveMediaTab()?.mediaSessionState?.controller?.nextTrack()
    }

    override fun onSkipToPrevious() {
        logger.debug("previousTrack()")

        store.state.findActiveMediaTab()?.mediaSessionState?.controller?.previousTrack()
    }

    override fun onSeekTo(pos: Long) {
        logger.debug("seekTo()")
        store.state.findActiveMediaTab()?.mediaSessionState?.controller?.seekTo(pos / MS_PER_SECOND, fast = false)
    }
}
