/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.Critical
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.CustomTabsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAdvancedDownloadSettingsSelectors
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAdvancedRemoteImprovementsSelectors

class SettingsAdvancedTest : BaseTest() {

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3369875
    @Critical
    @Test
    fun verifyTheRemoteImprovementsItemsTest() {
        on.settingsAdvancedRemoteImprovements
            .navigateToPage()
            .mozVerifyElementsByGroup(SettingsAdvancedRemoteImprovementsSelectors.Group.REMOTE_IMPROVEMENTS_ITEMS)
            .mozVerifyOptionSwitchIsChecked(SettingsAdvancedRemoteImprovementsSelectors.ALLOW_REMOTE_IMPROVEMENTS)
            .mozClick(SettingsAdvancedRemoteImprovementsSelectors.ALLOW_REMOTE_IMPROVEMENTS)
            .mozVerifyOptionSwitchIsNotChecked(SettingsAdvancedRemoteImprovementsSelectors.ALLOW_REMOTE_IMPROVEMENTS)
            .mozClick(SettingsAdvancedRemoteImprovementsSelectors.ALLOW_REMOTE_IMPROVEMENTS)
            .mozVerifyOptionSwitchIsChecked(SettingsAdvancedRemoteImprovementsSelectors.ALLOW_REMOTE_IMPROVEMENTS)
            .mozClick(SettingsAdvancedRemoteImprovementsSelectors.LEARN_MORE_LINK)
        on.customTabs
            .navigateToPage()
            .verifyUrl("support.mozilla.org")
            // The "Learn more" custom tab opens on top of HomeActivity's own task (unlike launchCustomTab's
            // new-task intent), so it must be closed or teardown's finishAndRemoveTask() cannot clear the task.
            .mozClick(CustomTabsSelectors.CLOSE_BUTTON)
    }

    // TestRail: https://mozilla.testrail.io/index.php?/cases/view/3979446
    @Critical
    @Test
    fun verifyTheDownloadSettingsItemsTest() {
        on.settingsAdvancedDownloadSettings
            .navigateToPage()
            .mozVerifyElementsByGroup(SettingsAdvancedDownloadSettingsSelectors.Group.DOWNLOAD_SETTINGS_ITEMS)
            .mozVerifyElementIsSelected(SettingsAdvancedDownloadSettingsSelectors.ASK_WHEN_I_DELETE_FILES_OPTION)
            .mozVerifyOptionSwitchIsNotChecked(
                SettingsAdvancedDownloadSettingsSelectors.MANAGE_DOWNLOADS_WITH_ANOTHER_APP_OPTION
            )
            .mozClick(SettingsAdvancedDownloadSettingsSelectors.DELETE_FROM_DEVICE_OPTION)
            .mozVerifyElementIsSelected(SettingsAdvancedDownloadSettingsSelectors.DELETE_FROM_DEVICE_OPTION)
            .mozClick(SettingsAdvancedDownloadSettingsSelectors.REMOVE_FROM_DOWNLOAD_HISTORY_OPTION)
            .mozVerifyElementIsSelected(SettingsAdvancedDownloadSettingsSelectors.REMOVE_FROM_DOWNLOAD_HISTORY_OPTION)
            .mozClick(SettingsAdvancedDownloadSettingsSelectors.MANAGE_DOWNLOADS_WITH_ANOTHER_APP_OPTION)
            .mozVerifyOptionSwitchIsChecked(
                SettingsAdvancedDownloadSettingsSelectors.MANAGE_DOWNLOADS_WITH_ANOTHER_APP_OPTION
            )
    }
}
