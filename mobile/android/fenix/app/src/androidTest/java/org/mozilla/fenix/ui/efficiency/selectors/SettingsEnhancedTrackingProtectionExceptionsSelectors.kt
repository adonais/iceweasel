/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsEnhancedTrackingProtectionExceptionsSelectors : SelectorContainer {

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preference_exceptions),
            description = "Tracking Protection exceptions toolbar title",
        )

    val EXCEPTIONS_ROOT =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "exceptionsLayout",
            description = "Tracking Protection exceptions content",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val EMPTY_MESSAGE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.exceptions_empty_message_description),
            description = "Exceptions empty state message",
        )

    val LEARN_MORE_LINK =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Learn more",
            description = "Learn more link",
        )

    // After tapping the Exceptions "Learn more" link the SUMO article opens in the browser. The path redirects
    // (see the legacy BrowserRobot.verifyETPLearnMoreURL fallback chain), so match the stable host as a substring
    // of the toolbar's displayed URL rather than a full URL.
    val LEARN_MORE_URL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "support.mozilla.org",
            description = "Enhanced tracking protection SUMO article URL",
        )

    // A site row in the populated exceptions list, identified by its host. Mirrors the legacy
    // verifySiteExceptionExists (itemContainingText(siteHost)).
    @Suppress("FunctionName")
    fun EXCEPTION_ROW(host: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = host,
            description = "Exceptions list entry for '$host'",
        )
}
