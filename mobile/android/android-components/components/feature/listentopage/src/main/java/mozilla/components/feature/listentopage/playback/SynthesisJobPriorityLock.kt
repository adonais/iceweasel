/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

internal enum class PlaybackIntent {
    Recovery,
    Seek,
    Restart,
}

/**
 * A class to manage which playback intents can override ongoing operations. For example, if we are actively recovering
 * from a failure but the user requests a seek operation, that should take higher priority.
 */
internal class SynthesisJobPriorityLock {

    private var holder: Handle? = null

    fun tryClaim(intent: PlaybackIntent): Handle? {
        val current = holder
        // Same level intents will replace the current
        if (current != null && intent < current.intent) return null
        return Handle(intent).also { holder = it }
    }

    inner class Handle(val intent: PlaybackIntent) {
        val isHeld: Boolean
            get() = holder === this

        fun release() {
            if (isHeld) holder = null
        }
    }
}
