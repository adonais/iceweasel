/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object ShareOverlaySelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        SHARE_TAB_LAYOUT,
        SHARE_TABS_SITE_LIST,
    }

    // Readiness: this is the share sheet's root layout (fragment_share.xml), so it is what tells
    // the framework we actually arrived. Without it the page had no presence anchor at all and
    // navigateToPage() reported success while still sitting on the browser.
    val SHARING_LAYOUT =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "sharingLayout",
            description = "Share overlay layout",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val DEVICES_LIST =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "devicesList",
            description = "Send to device section",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val RECENT_APPS_CONTAINER =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "recentAppsContainer",
            description = "Recently used apps section",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val APPS_LIST =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "appsList",
            description = "All apps section",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val SEND_TO_DEVICE_HEADER =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.share_device_subheader),
            description = "Send to device header",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val RECENTLY_USED_HEADER =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.share_link_recent_apps_subheader),
            description = "Recently used apps header",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val ALL_ACTIONS_HEADER =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.share_link_all_apps_subheader),
            description = "All actions header",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    val SAVE_AS_PDF_LABEL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(R.string.share_save_to_pdf),
            description = "Save as PDF label",
            groups = setOf(Group.SHARE_TAB_LAYOUT),
        )

    // The list of tabs/sites being shared, shown at the top of the share sheet when sharing tabs.
    val SHARED_SITE_LIST =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "shared_site_list",
            description = "Shared tabs site list",
            groups = setOf(Group.SHARE_TABS_SITE_LIST),
        )
}
