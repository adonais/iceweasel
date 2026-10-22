/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import mozilla.components.compose.base.R as composeBaseR
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection
import org.mozilla.fenix.webcompat.BrokenSiteReporterTestTags

object WebCompatReporterSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        REPORTER_VIEW_ITEMS,
        REPORTER_FORM,
        REPORTER_FORM_ONLY_ITEMS,
        SOMETHING_ELSE_REASON_FORM,
        EDIT_URLDIALOG,
        BROKEN_SITE_REASONS,
        REPORT_PREVIEW_ITEMS,
        REPORT_PREVIEW_BASIC_DETAILS,
        REPORT_PREVIEW_ANTITRACKING_DETAILS,
        REPORT_PREVIEW_GRAPHICS_DETAILS,
        REPORT_PREVIEW_BROWSER_INFO_DETAILS,
        REPORT_PREVIEW_APP_DETAILS,
        REPORT_PREVIEW_SYSTEM_DETAILS,
        REPORT_PREVIEW_PREFS_DETAILS,
        REPORT_PREVIEW_TAB_INFO_DETAILS,
        REPORT_PREVIEW_FRAMEWORKS_DETAILS,
    }

    private fun brokenSiteReason(reasonRes: Int, description: String) =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "${BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_REASON_OPTION}-${getStringResource(reasonRes)}",
            description = description,
            groups = setOf(Group.BROKEN_SITE_REASONS),
            scrollDirection = SwipeDirection.UP,
        )

    val REASON_LOAD = brokenSiteReason(R.string.webcompat_reporter_reason_load, "Broken site reason: site doesn't load")
    val REASON_CHECKOUT =
        brokenSiteReason(
            R.string.webcompat_reporter_reason_checkout,
            "Broken site reason: can't pay, check out or shop",
        )
    val REASON_SLOW = brokenSiteReason(R.string.webcompat_reporter_reason_slow2, "Broken site reason: site is slow")
    val REASON_MEDIA =
        brokenSiteReason(
            R.string.webcompat_reporter_reason_media2,
            "Broken site reason: video isn't playing or loading",
        )
    val REASON_CONTENT =
        brokenSiteReason(R.string.webcompat_reporter_reason_content2, "Broken site reason: missing content")
    val REASON_ACCOUNT =
        brokenSiteReason(R.string.webcompat_reporter_reason_account2, "Broken site reason: can't sign in or register")
    val REASON_TURN_OFF_ADBLOCKER =
        brokenSiteReason(
            R.string.webcompat_reporter_reason_turn_off_adblocker,
            "Broken site reason: site asked to turn off ad blocker",
        )
    val REASON_NOT_SUPPORTED =
        brokenSiteReason(
            R.string.webcompat_reporter_reason_notsupported_2,
            "Broken site reason: browser is blocked or unsupported",
        )
    val REASON_SITE_IS_DECEPTIVE =
        brokenSiteReason(
            R.string.webcompat_reporter_reason_site_is_deceptive,
            "Broken site reason: this site is deceptive",
        )
    val REASON_OTHER = brokenSiteReason(R.string.webcompat_reporter_reason_other, "Broken site reason: something else")

    val URL_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_url),
            description = "Report broken site URL label",
            groups =
                setOf(
                    Group.REPORTER_VIEW_ITEMS,
                    Group.REPORTER_FORM,
                    Group.SOMETHING_ELSE_REASON_FORM,
                ),
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val WHATS_BROKEN_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_whats_broken_3),
            description = "Report broken site \"What's not working?\" label",
            groups =
                setOf(
                    Group.REPORTER_VIEW_ITEMS,
                    Group.REPORTER_FORM,
                    Group.SOMETHING_ELSE_REASON_FORM,
                ),
            readiness = PageReadinessProfiles.READY_CONTENT,
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
            groups =
                setOf(
                    Group.REPORTER_VIEW_ITEMS,
                    Group.REPORTER_FORM,
                    Group.SOMETHING_ELSE_REASON_FORM,
                ),
            readiness = PageReadinessProfiles.READY_CONTENT,
            scrollDirection = SwipeDirection.UP,
        )

    @Suppress("FunctionName")
    fun REPORTED_SITE_URL(url: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = url,
            description = "Report broken site reported URL: $url",
        )

    val BROKEN_SITE_REPORTER_EDIT_URL_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_BUTTON,
            description = "Report broken site edit url button",
            groups = setOf(Group.REPORTER_VIEW_ITEMS),
        )

    val EDIT_SITE_URL_DIALOG_TEXT_FIELD =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_DIALOG_TEXT_FIELD,
            description = "Report broken site edit url dialog URL text field",
            groups = setOf(Group.EDIT_URLDIALOG),
        )

    val EDIT_SITE_URL_DIALOG_SAVE_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_DIALOG_SAVE_BUTTON,
            description = "Report broken site edit url dialog save button",
            groups = setOf(Group.EDIT_URLDIALOG),
        )

    val EDIT_SITE_URL_DIALOG_DISMISS_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_EDIT_URL_DIALOG_DISMISS_BUTTON,
            description = "Report broken site edit url dialog dismiss button",
            groups = setOf(Group.EDIT_URLDIALOG),
        )

    @Suppress("FunctionName")
    fun REPORTED_BROKEN_SITE_REASON(reason: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = reason,
            description = "Report broken site reported reason: $reason",
            groups = setOf(Group.REPORTER_VIEW_ITEMS),
        )

    val CLEAR_SELECTED_REASON_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.webcompat_reporter_clear_reason_content_description),
            description = "Report broken site clear selected reason button",
            groups = setOf(Group.REPORTER_FORM),
        )

    val DESCRIBE_PROBLEM_MANDATORY_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_mandatory_description),
            description = "Report broken site mandatory description label",
            groups = setOf(Group.SOMETHING_ELSE_REASON_FORM),
        )

    val DESCRIBE_PROBLEM_OPTIONAL_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_label_optional_description),
            description = "Report broken site optional description label",
            groups = setOf(Group.REPORTER_FORM),
        )

    val DESCRIPTION_INPUT_BOX =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_DESCRIPTION_INPUT,
            description = "Report broken site description input box",
            groups = setOf(Group.REPORTER_FORM, Group.REPORTER_FORM_ONLY_ITEMS, Group.SOMETHING_ELSE_REASON_FORM),
            scrollDirection = SwipeDirection.UP,
        )

    val ITEMS_BLOCKED_BY_TRACKING_PROTECTION_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_etp_checkbox_text_2),
            description = "Report broken site items blocked by tracking protection",
            groups = setOf(Group.REPORTER_FORM, Group.SOMETHING_ELSE_REASON_FORM),
            scrollDirection = SwipeDirection.UP,
        )

    val ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_INCLUDE_ETP_BLOCKED_URLS_CHECKBOX,
            description = "Report broken site items blocked by tracking protection checkbox",
            groups = setOf(Group.REPORTER_FORM, Group.REPORTER_FORM_ONLY_ITEMS, Group.SOMETHING_ELSE_REASON_FORM),
            scrollDirection = SwipeDirection.UP,
        )

    val PREVIEW_REPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_preview_report),
            description = "Report broken site preview report button",
            groups = setOf(Group.REPORTER_FORM, Group.REPORTER_FORM_ONLY_ITEMS, Group.SOMETHING_ELSE_REASON_FORM),
        )

    val REPORT_PREVIEW_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_preview_bottom_sheet_header),
            description = "Report preview title",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_BASIC_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "basic",
            description = "Report preview basic button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_ANTITRACKING_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "antitracking",
            description = "Report preview antitracking button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_GRAPHICS_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "graphics",
            description = "Report preview graphics button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_BROWSER_INFO_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "browserInfo",
            description = "Report preview browser info button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_APP_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "app",
            description = "Report preview app button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_SYSTEM_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "system",
            description = "Report preview system button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_PREFS_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "prefs",
            description = "Report preview system button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_TAB_INFO_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "tabInfo",
            description = "Report preview tab info button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_FRAMEWORKS_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = "frameworks",
            description = "Report preview frameworks button",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    val REPORT_PREVIEW_HANDLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = "collapse",
            description = "Report preview collapse handle",
            groups = setOf(Group.REPORT_PREVIEW_ITEMS),
        )

    @Suppress("FunctionName")
    fun REPORT_PREVIEW_OPTION_CHEVRON(reportPreviewOption: String = "", isExpanded: Boolean = false) =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value =
                if (isExpanded) {
                    "$reportPreviewOption, collapse"
                } else {
                    "$reportPreviewOption, expand"
                },
            description = "Report preview option: $reportPreviewOption expanded: $isExpanded chevron",
        )

    // Each expanded option renders its data as "key: value" text rows. The values are supplied by
    // Gecko and are not stable, so we match a row by its key prefix via a text substring.
    private fun previewOptionDetail(detailKey: String, group: Group) =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT_SUBSTRING,
            value = "$detailKey:",
            description = "Report preview option detail row: $detailKey",
            groups = setOf(group),
        )

    val REPORT_PREVIEW_BASIC_DETAIL_DESCRIPTION = previewOptionDetail("description", Group.REPORT_PREVIEW_BASIC_DETAILS)
    val REPORT_PREVIEW_BASIC_DETAIL_REASON = previewOptionDetail("reason", Group.REPORT_PREVIEW_BASIC_DETAILS)
    val REPORT_PREVIEW_BASIC_DETAIL_URL = previewOptionDetail("url", Group.REPORT_PREVIEW_BASIC_DETAILS)

    val REPORT_PREVIEW_ANTITRACKING_DETAIL_BLOCK_LIST =
        previewOptionDetail("blockList", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_IS_PRIVATE_BROWSING =
        previewOptionDetail("isPrivateBrowsing", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_HAS_MIXED_ACTIVE_CONTENT_BLOCKED =
        previewOptionDetail("hasMixedActiveContentBlocked", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_HAS_MIXED_DISPLAY_CONTENT_BLOCKED =
        previewOptionDetail("hasMixedDisplayContentBlocked", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_HAS_TRACKING_CONTENT_BLOCKED =
        previewOptionDetail("hasTrackingContentBlocked", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_BTP_HAS_PURGED_SITE =
        previewOptionDetail("btpHasPurgedSite", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)
    val REPORT_PREVIEW_ANTITRACKING_DETAIL_ETP_CATEGORY =
        previewOptionDetail("etpCategory", Group.REPORT_PREVIEW_ANTITRACKING_DETAILS)

    val REPORT_PREVIEW_GRAPHICS_DETAIL_DEVICE_PIXEL_RATIO =
        previewOptionDetail("devicePixelRatio", Group.REPORT_PREVIEW_GRAPHICS_DETAILS)
    val REPORT_PREVIEW_GRAPHICS_DETAIL_DEVICES = previewOptionDetail("devices", Group.REPORT_PREVIEW_GRAPHICS_DETAILS)
    val REPORT_PREVIEW_GRAPHICS_DETAIL_DRIVERS = previewOptionDetail("drivers", Group.REPORT_PREVIEW_GRAPHICS_DETAILS)
    val REPORT_PREVIEW_GRAPHICS_DETAIL_FEATURES = previewOptionDetail("features", Group.REPORT_PREVIEW_GRAPHICS_DETAILS)

    val REPORT_PREVIEW_BROWSER_INFO_DETAIL_ADDONS =
        previewOptionDetail("addons", Group.REPORT_PREVIEW_BROWSER_INFO_DETAILS)
    val REPORT_PREVIEW_BROWSER_INFO_DETAIL_EXPERIMENTS =
        previewOptionDetail("experiments", Group.REPORT_PREVIEW_BROWSER_INFO_DETAILS)

    val REPORT_PREVIEW_APP_DETAIL_APPLICATION_NAME =
        previewOptionDetail("applicationName", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_BUILD_ID = previewOptionDetail("buildId", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_DEFAULT_LOCALES =
        previewOptionDetail("defaultLocales", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_DEFAULT_USERAGENT_STRING =
        previewOptionDetail("defaultUseragentString", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_FISSION_ENABLED =
        previewOptionDetail("fissionEnabled", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_UPDATE_CHANNEL =
        previewOptionDetail("updateChannel", Group.REPORT_PREVIEW_APP_DETAILS)
    val REPORT_PREVIEW_APP_DETAIL_VERSION = previewOptionDetail("version", Group.REPORT_PREVIEW_APP_DETAILS)

    val REPORT_PREVIEW_SYSTEM_DETAIL_IS_TABLET = previewOptionDetail("isTablet", Group.REPORT_PREVIEW_SYSTEM_DETAILS)
    val REPORT_PREVIEW_SYSTEM_DETAIL_MEMORY = previewOptionDetail("memory", Group.REPORT_PREVIEW_SYSTEM_DETAILS)
    val REPORT_PREVIEW_SYSTEM_DETAIL_OS_ARCHITECTURE =
        previewOptionDetail("osArchitecture", Group.REPORT_PREVIEW_SYSTEM_DETAILS)
    val REPORT_PREVIEW_SYSTEM_DETAIL_OS_NAME = previewOptionDetail("osName", Group.REPORT_PREVIEW_SYSTEM_DETAILS)
    val REPORT_PREVIEW_SYSTEM_DETAIL_OS_VERSION = previewOptionDetail("osVersion", Group.REPORT_PREVIEW_SYSTEM_DETAILS)

    val REPORT_PREVIEW_PREFS_DETAIL_COOKIE_BEHAVIOR =
        previewOptionDetail("cookieBehavior", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_FORCED_ACCELERATED_LAYERS =
        previewOptionDetail("forcedAcceleratedLayers", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_GLOBAL_PRIVACY_CONTROL_ENABLED =
        previewOptionDetail("globalPrivacyControlEnabled", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_INSTALLTRIGGER_ENABLED =
        previewOptionDetail("installtriggerEnabled", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_OPAQUE_RESPONSE_BLOCKING =
        previewOptionDetail("opaqueResponseBlocking", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_RESIST_FINGERPRINTING_ENABLED =
        previewOptionDetail("resistFingerprintingEnabled", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_SOFTWARE_WEBRENDER =
        previewOptionDetail("softwareWebrender", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_THIRD_PARTY_COOKIE_BLOCKING_ENABLED =
        previewOptionDetail("thirdPartyCookieBlockingEnabled", Group.REPORT_PREVIEW_PREFS_DETAILS)
    val REPORT_PREVIEW_PREFS_DETAIL_THIRD_PARTY_COOKIE_BLOCKING_ENABLED_IN_PBM =
        previewOptionDetail("thirdPartyCookieBlockingEnabledInPbm", Group.REPORT_PREVIEW_PREFS_DETAILS)

    val REPORT_PREVIEW_TAB_INFO_DETAIL_LANGUAGES =
        previewOptionDetail("languages", Group.REPORT_PREVIEW_TAB_INFO_DETAILS)
    val REPORT_PREVIEW_TAB_INFO_DETAIL_USERAGENT_STRING =
        previewOptionDetail("useragentString", Group.REPORT_PREVIEW_TAB_INFO_DETAILS)

    val REPORT_PREVIEW_FRAMEWORKS_DETAIL_FASTCLICK =
        previewOptionDetail("fastclick", Group.REPORT_PREVIEW_FRAMEWORKS_DETAILS)
    val REPORT_PREVIEW_FRAMEWORKS_DETAIL_MARFEEL =
        previewOptionDetail("marfeel", Group.REPORT_PREVIEW_FRAMEWORKS_DETAILS)
    val REPORT_PREVIEW_FRAMEWORKS_DETAIL_MOBIFY = previewOptionDetail("mobify", Group.REPORT_PREVIEW_FRAMEWORKS_DETAILS)

    val SEND_REPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = BrokenSiteReporterTestTags.BROKEN_SITE_REPORTER_SEND_BUTTON,
            description = "Report broken site send report button",
            groups = setOf(Group.REPORTER_FORM, Group.REPORTER_FORM_ONLY_ITEMS, Group.SOMETHING_ELSE_REASON_FORM),
        )

    val DESCRIBE_PROBLEM_ERROR_MESSAGE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.webcompat_reporter_description_error),
            description = "Report broken site description error message",
            groups = setOf(Group.SOMETHING_ELSE_REASON_FORM),
        )

    val REPORT_SENT_SNACK_BAR_MESSAGE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.crash_reporting_snack_bar_message),
            description = "Report broken site sent snack bar message",
        )

    val CLOSE_REPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = "Close",
            description = "Report broken site close report button",
            groups = setOf(Group.REPORTER_VIEW_ITEMS, Group.REPORTER_FORM),
        )

    override val scrollTraversalOrder: Map<SelectorGroup, List<Selector>> =
        mapOf(
            Group.BROKEN_SITE_REASONS to
                listOf(
                    REASON_NOT_SUPPORTED,
                    REASON_LOAD,
                    REASON_MEDIA,
                    REASON_SITE_IS_DECEPTIVE,
                    REASON_CONTENT,
                    REASON_SLOW,
                    REASON_CHECKOUT,
                    REASON_ACCOUNT,
                    REASON_TURN_OFF_ADBLOCKER,
                    REASON_OTHER,
                ),
            Group.REPORTER_FORM to
                listOf(
                    DESCRIPTION_INPUT_BOX,
                    ITEMS_BLOCKED_BY_TRACKING_PROTECTION_DESCRIPTION,
                    ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX,
                    DESCRIPTION,
                ),
            Group.REPORTER_FORM_ONLY_ITEMS to
                listOf(
                    DESCRIPTION_INPUT_BOX,
                    ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX,
                ),
            Group.SOMETHING_ELSE_REASON_FORM to
                listOf(
                    DESCRIPTION_INPUT_BOX,
                    ITEMS_BLOCKED_BY_TRACKING_PROTECTION_DESCRIPTION,
                    ITEMS_BLOCKED_BY_TRACKING_PROTECTION_CHECKBOX,
                    DESCRIPTION,
                ),
        )
}
