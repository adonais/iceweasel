/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.utils

import android.net.Uri

/**
 * Image URL to request a size tailored for the parent container width and height. Also: force JPEG, quality 60, no
 * upscaling, no EXIF data. Uses Thumbor: https://thumbor.readthedocs.io/en/latest/usage.html
 */
internal const val IMAGE_URL =
    "https://img-getpocket.cdn.mozilla.net/{wh}/filters:format(jpeg):quality(60):no_upscale():strip_exif()/"

/**
 * Reformat the image URL to be able to request a size tailored for the parent container width and height.
 *
 * See
 * https://searchfox.org/mozilla-central/rev/7fb746f0be47ce0135af7bca9fffdb5cd1c4b1d5/browser/components/newtab/content-src/components/DiscoveryStreamComponents/DSImage/DSImage.jsx#120
 */
internal fun reformatImageUrl(url: String): String = IMAGE_URL + Uri.encode(url)
