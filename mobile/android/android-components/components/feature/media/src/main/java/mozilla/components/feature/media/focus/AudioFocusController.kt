/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.focus

import mozilla.components.concept.engine.mediasession.MediaSession

/**
 * A controller that knows how to request and abandon audio focus.
 */
internal interface AudioFocusController {
    /**
     * Request audio focus shaped for the given audio-session [type].
     */
    fun request(type: MediaSession.AudioSessionType): Int
    fun abandon()
}
