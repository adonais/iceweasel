/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.menu.share.QRCodeDownloader
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class QRCodeDownloaderTest {

    private val responses = mutableListOf<Boolean>()
    private val onResponse: (Context, Boolean) -> Unit = { _, success -> responses.add(success) }
    private val downloader = QRCodeDownloader(onResponse, currentTimeMillis = { TIMESTAMP })
    private val mockContentResolver: ContentResolver = mockk()
    private val mockContext: Context = mockk()

    // Kept distinct so that passing one where the other belongs cannot pass incidentally.
    private val sourceUri: Uri = Uri.Builder().scheme("content").authority("cache").path("qr_code").build()
    private val destinationUri: Uri = Uri.Builder().scheme("content").authority("media").path("downloads/1").build()

    private val downloadedFile: File
        get() =
            File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "qr_code_$TIMESTAMP.png",
            )

    // Before as well as after, so that a run interrupted partway cannot leave a file that fails the next one.
    @Before
    fun setUp() {
        downloadedFile.delete()
    }

    @After
    fun tearDown() {
        downloadedFile.delete()
    }

    @Test
    @Config(sdk = [28])
    fun `WHEN below Android Q THEN the source bytes are written to the downloads directory`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify(exactly = 0) { mockContentResolver.openOutputStream(any()) }
        assertEquals(listOf(true), responses)

        assertTrue(downloadedFile.exists())
        assertArrayEquals(PNG_BYTES, downloadedFile.readBytes())
    }

    @Test
    @Config(sdk = [28])
    fun `WHEN the copy fails partway THEN no partial file is left behind`() {
        every { mockContentResolver.openInputStream(any()) }.returns(streamFailingAfterOneChunk())

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        assertFalse(downloadedFile.exists())
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN above Android Q THEN the source bytes are copied verbatim to the media store`() {
        val outputStream = ByteArrayOutputStream()

        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(outputStream)
        every { mockContentResolver.update(any(), any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.openOutputStream(any()) }
        assertArrayEquals(PNG_BYTES, outputStream.toByteArray())
        assertEquals(listOf(true), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN writing to the media store THEN the entry stays pending until the bytes are written`() {
        val inserted = slot<ContentValues>()
        val cleared = slot<ContentValues>()

        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), capture(inserted)) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(ByteArrayOutputStream())
        every { mockContentResolver.update(destinationUri, capture(cleared), null, null) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        assertEquals(1, inserted.captured.getAsInteger(MediaStore.Downloads.IS_PENDING))
        assertEquals(0, cleared.captured.getAsInteger(MediaStore.Downloads.IS_PENDING))
        assertEquals(listOf(true), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the source cannot be opened THEN failure is reported`() {
        every { mockContentResolver.openInputStream(any()) }.returns(null)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify(exactly = 0) { mockContentResolver.openOutputStream(any()) }
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the media store entry cannot be created THEN failure is reported`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), any()) }.returns(null)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the media store output stream cannot be opened THEN the entry is removed`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(null)
        every { mockContentResolver.delete(any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.delete(destinationUri, null, null) }
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN opening the media store output stream throws THEN the entry is removed`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.throws(FileNotFoundException("boom"))
        every { mockContentResolver.delete(any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.delete(destinationUri, null, null) }
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the source is empty THEN the media store entry is removed`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(ByteArray(0)))
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(ByteArrayOutputStream())
        every { mockContentResolver.delete(any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.delete(destinationUri, null, null) }
        verify(exactly = 0) { mockContentResolver.update(any(), any(), any(), any()) }
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [28])
    fun `WHEN the source is empty THEN no file is left in the downloads directory`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(ByteArray(0)))

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        assertFalse(downloadedFile.exists())
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the entry cannot be made visible THEN it is removed and failure is reported`() {
        every { mockContentResolver.openInputStream(any()) }.returns(ByteArrayInputStream(PNG_BYTES))
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(ByteArrayOutputStream())
        every { mockContentResolver.update(any(), any(), any(), any()) }.returns(0)
        every { mockContentResolver.delete(any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.delete(destinationUri, null, null) }
        assertEquals(listOf(false), responses)
    }

    @Test
    @Config(sdk = [30])
    fun `WHEN the media store copy fails partway THEN the entry is removed`() {
        every { mockContentResolver.openInputStream(any()) }.returns(streamFailingAfterOneChunk())
        every { mockContentResolver.insert(any(), any()) }.returns(destinationUri)
        every { mockContentResolver.openOutputStream(destinationUri) }.returns(ByteArrayOutputStream())
        every { mockContentResolver.delete(any(), any(), any()) }.returns(1)

        downloader.saveQRCodeToDownloads(
            qrCodeUri = sourceUri,
            contentResolver = mockContentResolver,
            context = mockContext,
        )

        verify { mockContentResolver.delete(destinationUri, null, null) }
        assertEquals(listOf(false), responses)
    }

    private fun streamFailingAfterOneChunk(): InputStream =
        object : InputStream() {
            private var served = false

            override fun read(): Int = throw IOException("boom")

            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (served) throw IOException("boom")
                served = true
                val count = minOf(PNG_BYTES.size, len)
                PNG_BYTES.copyInto(b, off, 0, count)
                return count
            }
        }

    companion object {
        private const val TIMESTAMP = 1234L
        private val PNG_BYTES = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02)
    }
}
