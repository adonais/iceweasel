/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ListenPlayerTest {

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
}
