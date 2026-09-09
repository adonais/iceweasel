/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.engine.prompt

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.utils.ext.getParcelableCompat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShareDataTest {

    @Test
    fun `Create share data`() {
        val onlyTitle = ShareData(title = "Title", private = false)
        assertEquals("Title", onlyTitle.title)
        assertFalse(onlyTitle.private)

        val onlyText = ShareData(text = "Text", private = false)
        assertEquals("Text", onlyText.text)
        assertFalse(onlyText.private)

        val onlyUrl = ShareData(url = "https://mozilla.org", private = false)
        assertEquals("https://mozilla.org", onlyUrl.url)
        assertFalse(onlyUrl.private)

        val privateShare = ShareData(title = "Title", private = true)
        assertTrue(privateShare.private)
    }

    @Test
    fun `Save to bundle`() {
        val noText = ShareData(title = "Title", url = "https://mozilla.org", private = false)
        val noUrl = ShareData(title = "Title", text = "Text", private = true)
        val bundle =
            Bundle().apply {
                putParcelable("noText", noText)
                putParcelable("noUrl", noUrl)
            }
        assertEquals(noText, bundle.getParcelableCompat("noText", ShareData::class.java))
        assertEquals(false, bundle.getParcelableCompat("noText", ShareData::class.java)?.private)
        assertEquals(noUrl, bundle.getParcelableCompat("noUrl", ShareData::class.java))
        assertEquals(true, bundle.getParcelableCompat("noUrl", ShareData::class.java)?.private)
    }
}
