/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

package org.mozilla.fenix.longfox

import android.content.Context
import android.media.MediaPlayer
import androidx.annotation.RawRes

@Suppress("unused")
class SoundEffectsPlayer(private val context: Context) {

    private val activePlayers = mutableSetOf<MediaPlayer>()

    fun playSound(@RawRes soundResId: Int) {
        MediaPlayer.create(context, soundResId)?.apply {
            activePlayers.add(this)
            start()
            setOnCompletionListener {
                it.release()
                activePlayers.remove(it)
            }
        }
    }

    fun release() {
        activePlayers.forEach { it.stop(); it.release() }
        activePlayers.clear()
    }
}
