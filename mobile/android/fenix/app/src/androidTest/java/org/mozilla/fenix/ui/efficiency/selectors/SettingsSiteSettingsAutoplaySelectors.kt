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

/**
 * The Autoplay permission screen: four native RadioButtons in the layout shared by every permission screen.
 *
 * Each radio's text is the label and subtext joined by a newline, so exact text does not resolve. The ids are shared
 * with other permission screens, so the toolbar title identifies the page while a displayed radio proves its content is
 * ready.
 */
object SettingsSiteSettingsAutoplaySelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        AUTOPLAY_OPTIONS
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preference_browser_feature_autoplay),
            description = "Autoplay toolbar title",
        )

    val AUTOPLAY_CELLULAR_DATA_LABEL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = "cellular data only",
            description = "the Block audio and video on cellular data only label",
        )

    val ALLOW_AUDIO_AND_VIDEO_RADIO =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "ask_to_allow_radio",
            description = "the Allow audio and video radio button",
        )

    val BLOCK_AUDIO_AND_VIDEO_ON_CELLULAR_RADIO =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "block_radio",
            description = "the Block audio and video on cellular data only radio button",
            groups = setOf(Group.AUTOPLAY_OPTIONS),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    val BLOCK_AUDIO_ONLY_RADIO =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "third_radio",
            description = "the Block audio only radio button",
            groups = setOf(Group.AUTOPLAY_OPTIONS),
        )

    val BLOCK_AUDIO_AND_VIDEO_RADIO =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "fourth_radio",
            description = "the Block audio and video radio button",
            groups = setOf(Group.AUTOPLAY_OPTIONS),
        )
}
