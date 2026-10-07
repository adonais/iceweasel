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

object SettingsAdvancedDownloadSettingsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        DOWNLOAD_SETTINGS_ITEMS
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_downloads_2),
            description = "Download Settings Toolbar Title",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val FILE_STORAGE_HEADER =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_category_file_storage),
            description = "File storage section header",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val DEFAULT_DOWNLOAD_LOCATION_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_downloads_default_location_title),
            description = "Default download location",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val DELETE_OR_REMOVE_DOWNLOADS_HEADER =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_category_delete_or_remove_downloads),
            description = "Delete or remove downloads section header",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val DELETE_FROM_DEVICE_OPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT_MERGED,
            value = getStringResource(R.string.preferences_downloads_delete_from_device),
            description = "Delete from device option",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val DELETE_FROM_DEVICE_OPTION_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.preferences_downloads_delete_from_device_description),
            description = "Delete from device option description",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val REMOVE_FROM_DOWNLOAD_HISTORY_OPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT_MERGED,
            value = getStringResource(R.string.preferences_downloads_remove_from_download_history),
            description = "Remove from download history option",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val REMOVE_FROM_DOWNLOAD_HISTORY_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.preferences_downloads_remove_from_download_history_description),
            description = "Remove from download history option description",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val ASK_WHEN_I_DELETE_FILES_OPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT_MERGED,
            value = getStringResource(R.string.preferences_downloads_ask_when_to_delete_files),
            description = "Ask when to delete files option",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
    val MANAGE_DOWNLOADS_WITH_ANOTHER_APP_OPTION =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = getStringResource(R.string.preferences_choose_app_for_downloads),
            description = "Manage downloads with another app option",
            groups = setOf(Group.DOWNLOAD_SETTINGS_ITEMS),
        )
}
