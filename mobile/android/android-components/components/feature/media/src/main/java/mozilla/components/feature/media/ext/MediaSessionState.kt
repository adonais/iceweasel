/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.ext

import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.concept.engine.mediasession.MediaSession

/** If this state is [MediaSession.PlaybackState.PLAYING] then return true, else return false. */
fun MediaSessionState.playing(): Boolean {
    return when (playbackState) {
        MediaSession.PlaybackState.PLAYING -> true
        else -> false
    }
}
