/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import mozilla.components.compose.base.R as composeBaseR
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.webcompat.BrokenSiteReporterTestTags

object WebCompatReporterSelectors {

    val URL_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_url),
            description = "Report broken site URL label",
            groups = listOf("requiredForPage", "reporterViewItems", "reporterForm"),
        )

    val WHATS_BROKEN_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_whats_broken_3),
            description = "Report broken site \"What's not working?\" label",
            groups = listOf("requiredForPage", "reporterViewItems", "reporterForm"),
        )

    // The description is a single content-description node built from the body copy, the inlined
    // "Learn more" link text, and the compose-base link affordance suffix — mirroring how the legacy
    // BrowserRobot composed it. Splitting it would not match the node.
    val DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value =
                getStringResource(
                    R.string.webcompat_reporter_description_3,
                    appName,
                    getStringResource(R.string.webcompat_reporter_learn_more),
                ) + " " + getStringResource(composeBaseR.string.mozac_compose_base_link_text_links_available),
            description = "Report broken site description",
            groups = listOf("requiredForPage", "reporterViewItems", "reporterForm"),
        )

    @Suppress("FunctionName")
    fun REPORTED_SITE_URL(url: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = url,
            description = "Report broken site reported URL: $url",
            groups = listOf("reporterViewItems"),
        )

    val EDIT_SITE_URL_DIALOG_TEXT_FIELD =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_DIALOG_TEXT_FIELD,
            description = "Report broken site edit url dialog URL text field",
            groups = listOf("editURLDialog"),
        )

    val EDIT_SITE_URL_DIALOG_SAVE_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_DIALOG_SAVE_BUTTON,
            description = "Report broken site edit url dialog save button",
            groups = listOf("editURLDialog"),
        )

    @Suppress("FunctionName")
    fun REPORTED_BROKEN_SITE_REASON(reason: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = reason,
            description = "Report broken site reported reason: $reason",
            groups = listOf("reporterViewItems"),
        )

    val DESCRIBE_PROBLEM_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_optional_description),
            description = "Report broken site \"What's not working?\" label",
            groups = listOf("reporterForm"),
        )

    val DESCRIPTION_INPUT_BOX =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_DESCRIPTION_INPUT,
            description = "Report broken site description input box",
            groups = listOf("reporterForm"),
        )

    val ITEMS_BLOCKED_BY_TRACKING_PROTECTION_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_etp_checkbox_text_2),
            description = "Report broken site items blocked by tracking protection",
            groups = listOf("reporterForm"),
        )

    val ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_INCLUDE_ETP_BLOCKED_URLS_CHECKBOX,
            description = "Report broken site items blocked by tracking protection checkbox",
            groups = listOf("reporterForm"),
        )

    val PREVIEW_REPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_preview_report),
            description = "Report broken site preview report button",
            groups = listOf("reporterForm"),
        )

    val SEND_REPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_SEND_BUTTON,
            description = "Report broken site send report button",
            groups = listOf("reporterForm"),
        )

    val all =
        listOf(
            URL_LABEL,
            WHATS_BROKEN_LABEL,
            DESCRIPTION,
            REPORTED_SITE_URL(),
            EDIT_SITE_URL_DIALOG_TEXT_FIELD,
            EDIT_SITE_URL_DIALOG_SAVE_BUTTON,
            REPORTED_BROKEN_SITE_REASON(),
            DESCRIBE_PROBLEM_LABEL,
            DESCRIPTION_INPUT_BOX,
            ITEMS_BLOCKED_BY_TRACKING_PROTECTION_DESCRIPTION,
            ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX,
            PREVIEW_REPORT_BUTTON,
            SEND_REPORT_BUTTON,
        )
}
