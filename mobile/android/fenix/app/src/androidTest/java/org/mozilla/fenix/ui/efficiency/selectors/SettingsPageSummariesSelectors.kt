/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import mozilla.components.feature.summarize.R as summarizeR
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsPageSummariesSelectors {
    val PAGE_SUMMARIES_TOOLBAR_TITLE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.preferences_page_summaries),
            description = "the Page summaries toolbar title",
            groups = listOf("requiredForPage"),
        )

    val SUMMARIZE_PAGES_OPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(summarizeR.string.mozac_summarize_settings_summarize_pages),
            description = "the Summarize pages option",
            groups = listOf("requiredForPage"),
        )

    val LEARN_MORE_LINK =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(summarizeR.string.mozac_summarize_settings_learn_more),
            description = "the Learn more link",
            groups = listOf("pageSummariesView"),
        )

    val GESTURES_SUB_HEADER =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(summarizeR.string.mozac_summarize_settings_gestures),
            description = "the Gestures sub header",
            groups = listOf("pageSummariesView"),
        )

    val SHAKE_TO_SUMMARIZE_OPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(summarizeR.string.mozac_summarize_settings_shake_to_summarize),
            description = "the Shake to summarize option",
            groups = listOf("pageSummariesView"),
        )

    val all =
        listOf(
            PAGE_SUMMARIES_TOOLBAR_TITLE,
            SUMMARIZE_PAGES_OPTION,
            LEARN_MORE_LINK,
            GESTURES_SUB_HEADER,
            SHAKE_TO_SUMMARIZE_OPTION,
        )
}
