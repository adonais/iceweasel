/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import android.graphics.Bitmap
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.Request
import mozilla.components.concept.fetch.isSuccess
import mozilla.components.support.ktx.android.graphics.toSampledBitmap

private const val MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Given an image [url], fetches and returns a [Bitmap] if possible, otherwise null.
 *
 * The image is subsampled while it is decoded so that a remote image far larger than the view it ends up in never has
 * to be held in memory at full resolution. Reading the bounds means buffering the response, so one carrying more than
 * [MAX_IMAGE_BYTES] is rejected rather than read into memory.
 *
 * @param url The image URL to fetch from.
 * @param targetWidth The minimum width, in pixels, the decoded bitmap should have.
 * @param targetHeight The minimum height, in pixels, the decoded bitmap should have.
 * @return the decoded [Bitmap], or null if it could not be fetched or decoded, or exceeded [MAX_IMAGE_BYTES].
 */
suspend fun Client.bitmapForUrl(
    url: String,
    targetWidth: Int,
    targetHeight: Int,
): Bitmap? =
    withContext(Dispatchers.IO) {
        // Code below will cache it in Gecko's cache, which ensures that as long as we've fetched it once,
        // we will be able to display this avatar as long as the cache isn't purged (e.g. via 'clear user data').
        try {
            fetch(Request(url, useCaches = true, conservative = true)).use { response ->
                if (!response.isSuccess) {
                    return@use null
                }
                response.body.useStream { it.toSampledBitmap(targetWidth, targetHeight, MAX_IMAGE_BYTES) }
            }
        } catch (e: IOException) {
            null
        }
    }
