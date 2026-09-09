/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.share

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.annotation.RequiresApi
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.R

private val logger = Logger("QRCodeDownloader")

/**
 * Utility class to download and save QR code images to the device's Downloads folder.
 *
 * @param onResponse A callback function that is invoked with the [Context] and a [Boolean] indicating success or
 *   failure of the save operation. By default, it shows a Toast message.
 * @param currentTimeMillis provider for the current time in milliseconds, injectable for testing.
 */
class QRCodeDownloader(
    private val onResponse: (Context, Boolean) -> Unit = { context, isSuccess ->
        Toast.makeText(
                context,
                if (isSuccess) R.string.qr_code_download_success else R.string.qr_code_download_failure,
                Toast.LENGTH_SHORT,
            )
            .show()
    },
    private val currentTimeMillis: () -> Long = { System.currentTimeMillis() },
) {

    /**
     * Saves the QR code image represented by the given [qrCodeUri] to the Downloads folder.
     *
     * @param qrCodeUri The [Uri] of the QR code image to be saved.
     * @param contentResolver The [ContentResolver] to access image data.
     * @param context The [Context] used to show Toast messages.
     */
    fun saveQRCodeToDownloads(qrCodeUri: Uri, contentResolver: ContentResolver, context: Context) {
        val saved =
            try {
                contentResolver.openInputStream(qrCodeUri)?.use { inputStream ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        saveToMediaStoreDownloadsFolder(contentResolver, inputStream)
                    } else {
                        saveToDirectoryDownloads(inputStream)
                    }
                } ?: false
            } catch (e: IOException) {
                logger.warn("Unable to read the QR code at $qrCodeUri", e)
                false
            }

        onResponse(context, saved)
    }

    private fun saveToDirectoryDownloads(inputStream: InputStream): Boolean {
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = File(downloadsDir, "qr_code_${currentTimeMillis()}.png")

        val copied =
            try {
                FileOutputStream(file).use { inputStream.copyTo(it) }
            } catch (e: IOException) {
                logger.warn("Failed to write the QR code to $file", e)
                0L
            }

        if (copied == 0L) {
            file.delete()
            return false
        }
        return true
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveToMediaStoreDownloadsFolder(
        contentResolver: ContentResolver,
        inputStream: InputStream,
    ): Boolean {
        val contentValues =
            ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, "qr_code_${currentTimeMillis()}.png")
                put(MediaStore.Downloads.MIME_TYPE, "image/png")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }

        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues) ?: return false

        // openOutputStream both returns null and throws, so both share one failure path.
        val copied =
            try {
                contentResolver.openOutputStream(uri)?.use { inputStream.copyTo(it) } ?: 0L
            } catch (e: IOException) {
                logger.warn("Failed to write the QR code to $uri", e)
                0L
            }

        // The entry stays hidden until the flag is cleared, so failing to clear it is a failed save.
        val saved = copied > 0L && contentResolver.clearPendingFlag(uri)
        if (!saved) {
            contentResolver.delete(uri, null, null)
        }
        return saved
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun ContentResolver.clearPendingFlag(uri: Uri): Boolean {
        val cleared = update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null) > 0
        if (!cleared) {
            logger.warn("Wrote the QR code to $uri but could not make it visible")
        }
        return cleared
    }
}
