/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

/**
 * The "What's blocked by ... tracking protection" details screen, reached by tapping the info button next to a
 * Standard/Strict/Custom option. The same fragment backs all three modes; it shows every tracker category and hides the
 * ones the mode does not block - Standard hides "Tracking Content", Strict and Custom (with default settings) show all
 * seven. Titles are matched with UIAutomator (visibility-aware), so a hidden category genuinely does not resolve. This
 * is a transient screen dismissed with back, so it has no page object of its own.
 */
object SettingsEnhancedTrackingProtectionBlockingSelectors : SelectorContainer {

    val SOCIAL_MEDIA_TRACKERS =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_social_media_trackers_title),
            description = "Social Media Trackers category title",
        )

    val CROSS_SITE_COOKIES =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_cookies_title_2),
            description = "Cross-Site Cookies category title",
        )

    val CRYPTOMINERS =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_cryptominers_title),
            description = "Cryptominers category title",
        )

    val KNOWN_FINGERPRINTERS =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_known_fingerprinters_title),
            description = "Known Fingerprinters category title",
        )

    val TRACKING_CONTENT =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_tracking_content_title),
            description = "Tracking Content category title",
            scrollDirection = SwipeDirection.UP,
        )

    val REDIRECT_TRACKERS =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_redirect_trackers_title),
            description = "Redirect Trackers category title",
            scrollDirection = SwipeDirection.UP,
        )

    val SUSPECTED_FINGERPRINTERS =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.etp_suspected_fingerprinters_title),
            description = "Suspected Fingerprinters category title",
            scrollDirection = SwipeDirection.UP,
        )
}
