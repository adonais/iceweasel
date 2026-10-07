/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsAdvancedRemoteImprovementsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        REMOTE_IMPROVEMENTS_ITEMS
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_remote_improvements),
            description = "Remote Improvements Toolbar Title",
            groups = setOf(Group.REMOTE_IMPROVEMENTS_ITEMS),
        )
    val ALLOW_REMOTE_IMPROVEMENTS =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.remote_improvements_title),
            description = "Allow remote improvements toggle",
            groups = setOf(Group.REMOTE_IMPROVEMENTS_ITEMS),
        )
    val ALLOW_REMOTE_IMPROVEMENTS_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.remote_improvements_description),
            description = "Allow remote improvements description",
            groups = setOf(Group.REMOTE_IMPROVEMENTS_ITEMS),
        )
    val LEARN_MORE_LINK =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.remote_improvements_learn_more),
            description = "Learn more link",
            groups = setOf(Group.REMOTE_IMPROVEMENTS_ITEMS),
        )
}
