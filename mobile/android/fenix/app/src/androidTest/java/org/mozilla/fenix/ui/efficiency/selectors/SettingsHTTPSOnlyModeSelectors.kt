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

object SettingsHTTPSOnlyModeSelectors : SelectorContainer {

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_https_only_title),
            description = "HTTPS-Only Mode toolbar title",
        )

    val HTTPS_MODE_OPTION_SUMMARY =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value =
                "Automatically attempts to connect to sites using HTTPS encryption protocol for increased security. Learn more",
            description = "HTTPS only mode option summary",
        )

    val HTTPS_ONLY_MODE_TOGGLE =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "https_only_switch",
            description = "HTTPS-Only Mode toggle",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val HTTPS_ONLY_ALL_TABS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "https_only_all_tabs",
            description = "Enable in all tabs option",
        )

    val HTTPS_ONLY_PRIVATE_TABS_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "https_only_private_tabs",
            description = "Enable in private tabs only option",
        )
}
