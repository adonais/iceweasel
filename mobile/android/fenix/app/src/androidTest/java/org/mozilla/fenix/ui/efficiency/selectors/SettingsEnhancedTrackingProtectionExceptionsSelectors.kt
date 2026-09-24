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

    val LEARN_MORE_LINK =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = "Learn more",
            description = "Learn more link",
        )
}
