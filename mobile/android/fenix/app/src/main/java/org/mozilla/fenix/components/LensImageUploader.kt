/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.graphics.scale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.MutableHeaders
import mozilla.components.concept.fetch.Request
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.max

/**
 * Handles image processing and upload to Google Lens.
 */
class LensImageUploader(
    private val context: Context,
    private val client: Client,
    private val userAgent: String,
) {

    /**
     * Decodes, scales, compresses, and uploads the image at [imageUri] to Google Lens.
     *
     * @return The Lens results URL on success, or null on failure.
     */
    suspend fun upload(imageUri: Uri): String? = withContext(Dispatchers.IO) {
        val bitmap = decodeBitmap(imageUri) ?: return@withContext null

        val scaled = scaleBitmap(bitmap)
        val scaledWidth = scaled.width
        val scaledHeight = scaled.height

        val jpegData = compressToJpeg(scaled)

        if (scaled !== bitmap) scaled.recycle()
        bitmap.recycle()

        val metrics = context.resources.displayMetrics
        val timestamp = System.currentTimeMillis()
        val locale = Locale.getDefault().language

        val uploadUrl = "https://lens.google.com/v3/upload" +
            "?hl=$locale" +
            "&vpw=${metrics.widthPixels}" +
            "&vph=${metrics.heightPixels}" +
            "&ep=ccm" +
            "&st=$timestamp"

        val boundary = "----LensBoundary${System.nanoTime()}"

        val bodyStream = ByteArrayOutputStream()
        bodyStream.write("--$boundary\r\n".toByteArray())
        bodyStream.write(
            "Content-Disposition: form-data; name=\"encoded_image\"; filename=\"image.jpg\"\r\n"
                .toByteArray(),
        )
        bodyStream.write("Content-Type: image/jpeg\r\n\r\n".toByteArray())
        bodyStream.write(jpegData)
        bodyStream.write("\r\n".toByteArray())
        bodyStream.write("--$boundary\r\n".toByteArray())
        bodyStream.write(
            "Content-Disposition: form-data; name=\"processed_image_dimensions\"\r\n\r\n"
                .toByteArray(),
        )
        bodyStream.write("$scaledWidth,$scaledHeight\r\n".toByteArray())
        bodyStream.write("--$boundary--\r\n".toByteArray())
        val bodyBytes = bodyStream.toByteArray()

        val request = Request(
            url = uploadUrl,
            method = Request.Method.POST,
            headers = MutableHeaders(
                "Content-Type" to "multipart/form-data; boundary=$boundary",
                "User-Agent" to userAgent,
            ),
            body = Request.Body(ByteArrayInputStream(bodyBytes)),
            cookiePolicy = Request.CookiePolicy.INCLUDE,
            connectTimeout = Pair(CONNECT_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS),
            readTimeout = Pair(READ_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS),
            useCaches = false,
        )

        client.fetch(request).use { response ->
            if (response.status in SUCCESS_RANGE && response.url != uploadUrl) {
                response.url
            } else {
                null
            }
        }
    }

    private fun decodeBitmap(uri: Uri): Bitmap? {
        return context.contentResolver.openInputStream(uri)?.use { inputStream ->
            BitmapFactory.decodeStream(inputStream)
        }
    }

    private fun scaleBitmap(bitmap: Bitmap): Bitmap {
        val longestDim = max(bitmap.width, bitmap.height)
        if (longestDim <= MAX_IMAGE_DIMENSION) return bitmap

        val scale = MAX_IMAGE_DIMENSION.toFloat() / longestDim
        val newWidth = (bitmap.width * scale).toInt()
        val newHeight = (bitmap.height * scale).toInt()
        return bitmap.scale(newWidth, newHeight, true)
    }

    private fun compressToJpeg(bitmap: Bitmap): ByteArray {
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
        return baos.toByteArray()
    }

    companion object {
        private const val MAX_IMAGE_DIMENSION = 1000
        private const val JPEG_QUALITY = 85
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        private val SUCCESS_RANGE = 200..299
    }
}
