/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsPageSummariesSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsSelectors

class SettingsPageSummariesTest : BaseTest() {

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/4036042
    @SmokeTest
    @Test
    fun verifyPageSummariesUITest() {
        // Given: the app is launched with the shake-to-summarize feature flag enabled

        // When: we open the Settings screen
        // Then: the "Page summaries" entry is present
        on.settings
            .navigateToPage()
            .mozSwipeTo(SettingsSelectors.PAGE_SUMMARIES_BUTTON)
            .mozVerify(SettingsSelectors.PAGE_SUMMARIES_BUTTON)

        // When: we open the Page summaries sub-menu
        // Then: the Page summaries view and all its options are displayed
        on.settingsPageSummaries
            .navigateToPage()
            .mozVerify(SettingsPageSummariesSelectors.PAGE_SUMMARIES_TOOLBAR_TITLE)
            .mozVerify(SettingsSelectors.GO_BACK_BUTTON)
            .mozVerify(SettingsPageSummariesSelectors.SUMMARIZE_PAGES_OPTION)
            .mozVerify(SettingsPageSummariesSelectors.LEARN_MORE_LINK)
            .mozVerify(SettingsPageSummariesSelectors.GESTURES_SUB_HEADER)
            .mozVerify(SettingsPageSummariesSelectors.SHAKE_TO_SUMMARIZE_OPTION)
    }
}
