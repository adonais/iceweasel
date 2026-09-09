/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.ktx.android.graphics

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.io.IOException
import java.io.InputStream
import kotlin.test.assertNotNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SampledBitmapTest {

    @get:Rule val temporaryFolder = TemporaryFolder()

    private val imageBytes: ByteArray
        get() = javaClass.getResourceAsStream("/png/sampled_bitmap.png")!!.buffered().readBytes()

    private fun imageFile(): File = temporaryFolder.newFile("image.png").apply { writeBytes(imageBytes) }

    // The undecodable-data case is deliberately not covered: Robolectric's BitmapFactory shadow
    // fabricates a bitmap with positive bounds instead of reporting the failure the way the real
    // BitmapFactory does, so such a test would assert shadow behaviour rather than ours.

    @Test
    fun `WHEN the target is much smaller than the image THEN it is subsampled down to it`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 40, targetHeight = 20)

        assertEquals(40, bitmap!!.width)
        assertEquals(20, bitmap.height)
    }

    @Test
    fun `WHEN the target is not a power of two fraction THEN the result stays above it`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 100, targetHeight = 50)

        // 320x160 sampled by 2 is 160x80, which is the smallest subsample still above the target.
        assertEquals(160, bitmap!!.width)
        assertEquals(80, bitmap.height)
    }

    @Test
    fun `WHEN the target is larger than the image THEN it is decoded at full size`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 640, targetHeight = 320)

        assertEquals(320, bitmap!!.width)
        assertEquals(160, bitmap.height)
    }

    @Test
    fun `WHEN only one dimension would fit the target THEN the image is not subsampled further`() {
        // Halving 320x160 to 160x80 would drop the height below the requested 100.
        val bitmap = imageFile().toSampledBitmap(targetWidth = 40, targetHeight = 100)

        assertEquals(320, bitmap!!.width)
        assertEquals(160, bitmap.height)
    }

    @Test
    fun `WHEN the target size is not positive THEN the image is not subsampled`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 0, targetHeight = 0)

        assertEquals(320, bitmap!!.width)
        assertEquals(160, bitmap.height)
    }

    @Test
    fun `WHEN the image is far larger than the target THEN it is still decoded rather than rejected`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 1, targetHeight = 1)

        assertNotNull(bitmap)
        // A 1x1 target subsamples as far as it can, by 128, so 320 does not divide evenly and the
        // decoder is left to round. Only the fact that it shrank rather than being rejected matters.
        assertTrue(bitmap.width < 320)
    }

    @Test
    fun `WHEN the image is far smaller than the target THEN it is still decoded rather than rejected`() {
        val bitmap = imageFile().toSampledBitmap(targetWidth = 4096, targetHeight = 4096)

        assertNotNull(bitmap)
        assertEquals(320, bitmap.width)
    }

    @Test
    fun `WHEN the file does not exist THEN null is returned`() {
        val file = File(temporaryFolder.root, "missing.png")

        assertNull(file.toSampledBitmap(targetWidth = 40, targetHeight = 20))
    }

    @Test
    fun `WHEN decoding a stream THEN it is subsampled the same way`() {
        val bitmap =
            imageBytes
                .inputStream()
                .toSampledBitmap(
                    targetWidth = 40,
                    targetHeight = 20,
                    maxBytes = MAX_BYTES,
                )

        assertEquals(40, bitmap!!.width)
        assertEquals(20, bitmap.height)
    }

    @Test
    fun `WHEN the stream carries more than the byte limit THEN null is returned`() {
        val bytes = imageBytes

        val bitmap =
            bytes
                .inputStream()
                .toSampledBitmap(
                    targetWidth = 40,
                    targetHeight = 20,
                    maxBytes = bytes.size - 1,
                )

        assertNull(bitmap)
    }

    @Test
    fun `WHEN reading the stream fails partway THEN null is returned`() {
        val bitmap =
            streamFailingAfterOneChunk()
                .toSampledBitmap(
                    targetWidth = 40,
                    targetHeight = 20,
                    maxBytes = MAX_BYTES,
                )

        assertNull(bitmap)
    }

    @Test
    fun `WHEN the byte limit is not positive THEN nothing is buffered and null is returned`() {
        val bitmap =
            imageBytes
                .inputStream()
                .toSampledBitmap(
                    targetWidth = 40,
                    targetHeight = 20,
                    maxBytes = 0,
                )

        assertNull(bitmap)
    }

    @Test
    fun `WHEN the stream is exactly at the byte limit THEN it is still decoded`() {
        val bytes = imageBytes

        val bitmap =
            bytes
                .inputStream()
                .toSampledBitmap(
                    targetWidth = 40,
                    targetHeight = 20,
                    maxBytes = bytes.size,
                )

        assertEquals(40, bitmap!!.width)
    }

    private fun streamFailingAfterOneChunk(): InputStream =
        object : InputStream() {
            private var served = false

            override fun read(): Int = throw IOException("boom")

            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (served) throw IOException("boom")
                served = true
                val chunk = imageBytes
                val count = minOf(chunk.size, len)
                chunk.copyInto(b, off, 0, count)
                return count
            }
        }

    companion object {
        private const val MAX_BYTES = 1024 * 1024
    }
}
