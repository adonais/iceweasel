/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import org.mozilla.fenix.R
import mozilla.components.ui.icons.R as iconsR

/**
 * The categories of Tracking Protection to display.
 */
enum class TrackingProtectionCategory(
    @param:StringRes val title: Int,
    @param:StringRes val description: Int,
    @param:DrawableRes val icon: Int,
) {
    SOCIAL_MEDIA_TRACKERS(
        R.string.etp_social_media_trackers_title,
        R.string.etp_social_media_trackers_description,
        iconsR.drawable.mozac_ic_thumbs_down_24,
    ),
    CROSS_SITE_TRACKING_COOKIES(
        R.string.etp_cookies_title,
        R.string.etp_cookies_description,
        iconsR.drawable.mozac_ic_cookies_24,
    ),
    CRYPTOMINERS(
        R.string.etp_cryptominers_title,
        R.string.etp_cryptominers_description,
        iconsR.drawable.mozac_ic_cryptominer_24,
    ),
    FINGERPRINTERS(
        R.string.etp_known_fingerprinters_title,
        R.string.etp_known_fingerprinters_description,
        iconsR.drawable.mozac_ic_fingerprinter_24,
    ),
    TRACKING_CONTENT(
        R.string.etp_tracking_content_title,
        R.string.etp_tracking_content_description,
        iconsR.drawable.mozac_ic_warning_fill_24,
    ),
}
