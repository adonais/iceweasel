/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import androidx.annotation.DrawableRes
import org.mozilla.fenix.R

/**
 * Represents the favicon of a top site.
 */
sealed class TopSitesFavicon {
    /**
     * An image URL.
     *
     * @property url The URL of the image to use.
     */
    data class ImageUrl(val url: String?) : TopSitesFavicon()

    /**
     * A drawable background.
     *
     * @property drawableResId The drawable resource ID to use.
     */
    data class Drawable(@param:DrawableRes val drawableResId: Int) : TopSitesFavicon()
}

internal fun getTopSitesFavicon(url: String): TopSitesFavicon {
    return when (url) {
        "https://tenki.jp/" -> TopSitesFavicon.ImageUrl(url = "https://tenki.jp/favicon.ico")
        "https://m.yahoo.co.jp/" -> TopSitesFavicon.ImageUrl(url = "https://s.yimg.jp/c/icon/s/bsc/2.0/favicon.ico")
        "https://ameblo.jp/" -> TopSitesFavicon.ImageUrl(url = "https://stat100.ameba.jp/common_style/img/favicon.ico")
        "https://blog.mozilla.org/ja/firefox-ja/android-guide/" ->
            TopSitesFavicon.Drawable(R.drawable.ic_japan_onboarding_favicon)

        else -> TopSitesFavicon.ImageUrl(url = null)
    }
}
