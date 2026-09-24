/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

object SettingsAboutSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        ABOUT_SECTION,
        ABOUT_FIREFOX,
        WHATS_NEW,
        SUPPORT_ITEM,
        CRASHES,
        PRIVACY_NOTICE,
        KNOW_YOUR_RIGHTS,
        LICENSING_INFORMATION,
        LIBRARIES_THAT_WE_USE,
        ABOUT_INFO,
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_about, appName),
            description = "About toolbar title",
        )

    val NAVIGATE_BACK_TOOLBAR_BUTTON =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
            value = "Navigate up",
            description = "Navigate back toolbar button",
        )

    val WHATS_NEW_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "new in",
            description = "The Whats New Title",
            groups = setOf(Group.ABOUT_SECTION, Group.ABOUT_FIREFOX, Group.WHATS_NEW),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val SUPPORT_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "Support",
            description = "The Support Link",
            groups = setOf(Group.ABOUT_SECTION, Group.ABOUT_FIREFOX, Group.SUPPORT_ITEM),
        )

    val CRASHES_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "Crashes",
            description = "The Crashes Button",
            groups = setOf(Group.ABOUT_SECTION, Group.ABOUT_FIREFOX, Group.CRASHES),
        )

    val PRIVACY_NOTICE_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "Privacy Notice",
            description = "The Privacy Notice Button",
            groups = setOf(Group.ABOUT_SECTION, Group.ABOUT_FIREFOX, Group.PRIVACY_NOTICE),
        )

    val KNOW_YOUR_RIGHTS_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Know your rights",
            description = "The Know your rights Button",
            groups = setOf(Group.ABOUT_FIREFOX, Group.KNOW_YOUR_RIGHTS),
        )

    val LICENSING_INFORMATION_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Licensing information",
            description = "The Licensing Information Button",
            groups = setOf(Group.ABOUT_FIREFOX, Group.LICENSING_INFORMATION),
            scrollDirection = SwipeDirection.UP,
        )

    val LIBRARIES_THAT_WE_USE_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = "Libraries that we use",
            description = "The Libraries that we use Button",
            groups = setOf(Group.ABOUT_FIREFOX, Group.LIBRARIES_THAT_WE_USE),
            scrollDirection = SwipeDirection.UP,
        )

    val ABOUT_INFO_TEXTBOX =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID,
            value = "about_text",
            description = "The About Info Textbox",
            groups = setOf(Group.ABOUT_FIREFOX, Group.ABOUT_INFO),
        )

    override val scrollTraversalOrder: Map<SelectorGroup, List<Selector>> =
        mapOf(Group.ABOUT_FIREFOX to listOf(LICENSING_INFORMATION_BUTTON, LIBRARIES_THAT_WE_USE_BUTTON))
}
