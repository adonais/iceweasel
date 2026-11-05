/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import kotlin.test.assertNotNull
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf

@RunWith(AndroidJUnit4::class)
class ListenPlayerTest {

    private var player: ListenPlayer? = null

    @After
    fun tearDown() {
        player?.release()
    }

    @Test
    fun `test that a chunk carries what the notification says is being read`() {
        val item = File("/audio/1.wav").toMediaItem(ArticleDisplayData(title = "An article", site = "example.org"))

        assertEquals("An article", item.mediaMetadata.title.toString())
        assertEquals("example.org", item.mediaMetadata.artist.toString())
    }

    @Test
    fun `test that a chunk still plays the file it was made from`() {
        val file = File("/audio/1.wav")

        val item = file.toMediaItem(ArticleDisplayData())

        assertEquals(Uri.fromFile(file), item.localConfiguration?.uri)
    }

    @OptIn(UnstableApi::class)
    @Test
    fun `test that playing asks for audio focus as speech and pauses rather than diminishing volume`() {
        val audioManager = testContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val exoPlayer = ListenPlayer(testContext).also { player = it }.exoPlayer

        exoPlayer.setMediaItem(File("/audio/1.wav").toMediaItem(ArticleDisplayData()))
        exoPlayer.prepare()
        exoPlayer.play()
        // The player asks for focus from its own playback thread.
        shadowOf(exoPlayer.playbackLooper).idle()

        val request = assertNotNull(shadowOf(audioManager).lastAudioFocusRequest?.audioFocusRequest)
        assertEquals(AudioManager.AUDIOFOCUS_GAIN, request.focusGain)
        assertEquals(AudioAttributes.USAGE_MEDIA, request.audioAttributes.usage)
        assertEquals(AudioAttributes.CONTENT_TYPE_SPEECH, request.audioAttributes.contentType)
        assertTrue(request.willPauseWhenDucked())
    }
}
