/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.downloads.ext

import androidx.core.net.toUri
import mozilla.components.browser.state.state.content.DownloadState
import mozilla.components.concept.fetch.Headers
import mozilla.components.concept.fetch.Headers.Names.CONTENT_DISPOSITION
import mozilla.components.concept.fetch.Headers.Names.CONTENT_LENGTH
import mozilla.components.concept.fetch.Headers.Names.CONTENT_TYPE
import mozilla.components.concept.fetch.Headers.Names.E_TAG
import mozilla.components.feature.downloads.parseContentRange
import mozilla.components.support.ktx.kotlin.sanitizeFileName
import mozilla.components.support.utils.DownloadFileUtils
import mozilla.components.support.utils.ext.decodeIfNeeded
import java.io.InputStream
import java.net.URLConnection

internal fun DownloadState.isScheme(protocols: Iterable<String>): Boolean {
    val scheme = url.trim().toUri().scheme ?: return false
    return protocols.contains(scheme)
}

/**
 * Returns a copy of the download with some fields filled in based on values from a response.
 *
 * @param headers Headers from the response.
 * @param downloadFileUtils [DownloadFileUtils] helper for handling download file operations.
 * @param stream Stream of the response body.
 */
internal fun DownloadState.withResponse(
    headers: Headers,
    downloadFileUtils: DownloadFileUtils,
    stream: InputStream?,
): DownloadState {
    val contentDisposition = headers[CONTENT_DISPOSITION]
    val contentType = resolveContentType(headers, stream)

    val newFileName = if (fileName.isNullOrBlank()) {
        downloadFileUtils.guessFileName(
            contentDisposition = contentDisposition,
            url = url,
            mimeType = contentType,
        )
    } else {
        fileName
    }
    return copy(
        fileName = newFileName?.decodeIfNeeded()?.sanitizeFileName(),
        contentType = contentType,
        contentLength = resolveContentLength(headers),
        etag = headers[E_TAG],
    )
}

private fun DownloadState.resolveContentType(headers: Headers, stream: InputStream?): String? =
    contentType
        ?: stream?.let { URLConnection.guessContentTypeFromStream(it) }
        ?: headers[CONTENT_TYPE]

private fun DownloadState.resolveContentLength(headers: Headers): Long? =
    contentLength
        ?: parseContentRange(headers)?.totalLength
        ?: headers[CONTENT_LENGTH]?.toLongOrNull()

internal fun DownloadState.getRealFilenameOrGuessed(
    downloadFileUtils: DownloadFileUtils,
): String {
    return fileName ?: downloadFileUtils.guessFileName(
        contentDisposition = null,
        url = url,
        mimeType = contentType,
    )
}
