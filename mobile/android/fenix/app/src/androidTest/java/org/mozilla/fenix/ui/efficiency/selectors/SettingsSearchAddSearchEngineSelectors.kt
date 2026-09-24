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

object SettingsSearchAddSearchEngineSelectors : SelectorContainer {

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.search_engine_add_custom_search_engine_title),
            description = "Add search engine toolbar title",
        )

    // View-based form (fragment_save_search_engine): match by resource id.
    val ENGINE_NAME_FIELD =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "edit_engine_name",
            description = "Search engine name field",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val SEARCH_STRING_FIELD =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "edit_search_string",
            description = "Search string URL field",
        )

    val SAVE_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "save_button",
            description = "Save search engine button",
        )
}
