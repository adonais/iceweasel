/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import io.mockk.every
import io.mockk.mockk
import java.io.ByteArrayInputStream
import java.io.IOException
import kotlin.test.assertNotNull
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.MutableHeaders
import mozilla.components.concept.fetch.Request
import mozilla.components.concept.fetch.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ClientTest {

    private val imageBytes: ByteArray
        get() = javaClass.getResourceAsStream("/png/avatar.png")!!.buffered().readBytes()

    private fun clientReturning(bytes: ByteArray, status: Int = 200): Client =
        mockk<Client>().apply {
            every { fetch(any()) } answers
                {
                    Response(
                        url = "https://example.com/avatar.png",
                        status = status,
                        headers = MutableHeaders(),
                        body = Response.Body(ByteArrayInputStream(bytes)),
                    )
                }
        }

    @Test
    fun `WHEN the image is larger than the target THEN it is subsampled during the decode`() = runTest {
        val bitmap =
            clientReturning(imageBytes)
                .bitmapForUrl(
                    url = "https://example.com/avatar.png",
                    targetWidth = 24,
                    targetHeight = 24,
                )

        assertNotNull(bitmap)
        assertTrue(bitmap.width < SOURCE_SIZE)
        assertTrue(bitmap.width >= 24)
    }

    @Test
    fun `WHEN the target is as large as the image THEN it is decoded at full size`() = runTest {
        val bitmap =
            clientReturning(imageBytes)
                .bitmapForUrl(
                    url = "https://example.com/avatar.png",
                    targetWidth = SOURCE_SIZE,
                    targetHeight = SOURCE_SIZE,
                )

        assertNotNull(bitmap)
        assertEquals(SOURCE_SIZE, bitmap.width)
    }

    @Test
    fun `WHEN the response is not successful THEN the body is not decoded`() = runTest {
        val bitmap =
            clientReturning(imageBytes, status = 404)
                .bitmapForUrl(
                    url = "https://example.com/avatar.png",
                    targetWidth = 24,
                    targetHeight = 24,
                )

        assertNull(bitmap)
    }

    @Test
    fun `WHEN the response is larger than the byte limit THEN null is returned`() = runTest {
        val oversized = ByteArray(6 * 1024 * 1024)
        imageBytes.copyInto(oversized)

        val bitmap =
            clientReturning(oversized)
                .bitmapForUrl(
                    url = "https://example.com/avatar.png",
                    targetWidth = 24,
                    targetHeight = 24,
                )

        assertNull(bitmap)
    }

    @Test
    fun `WHEN the fetch fails THEN null is returned`() = runTest {
        val client =
            mockk<Client>().apply {
                every { fetch(any<Request>()) } throws IOException("boom")
            }

        assertNull(
            client.bitmapForUrl(
                url = "https://example.com/avatar.png",
                targetWidth = 24,
                targetHeight = 24,
            )
        )
    }

    @Test
    fun `WHEN reading the response body fails THEN null is returned`() = runTest {
        val client =
            mockk<Client>().apply {
                every { fetch(any<Request>()) } answers
                    {
                        Response(
                            url = "https://example.com/avatar.png",
                            status = 200,
                            headers = MutableHeaders(),
                            body =
                                Response.Body(
                                    object : ByteArrayInputStream(ByteArray(0)) {
                                        override fun read(b: ByteArray, off: Int, len: Int): Int =
                                            throw IOException("boom")
                                    }
                                ),
                        )
                    }
            }

        assertNull(
            client.bitmapForUrl(
                url = "https://example.com/avatar.png",
                targetWidth = 24,
                targetHeight = 24,
            )
        )
    }

    companion object {
        private const val SOURCE_SIZE = 512
    }
}
