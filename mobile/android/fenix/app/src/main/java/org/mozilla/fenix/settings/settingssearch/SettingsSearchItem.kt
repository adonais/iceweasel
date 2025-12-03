/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

/**
 * Class representing a settings item in the Settings Search.
 *
 * @property title Title [String] of the settings item.
 * @property summary Summary [String] of the settings item.
 * @property preferenceKey Preference key [String] of the settings item.
 * @property breadcrumbs Breadcrumbs [List] of [String]s that leads to the settings item.
 *                  [0] is the section on the main Settings page
 *                  [1] is the subPage title, if any
 *                  [2] is the subPage section, if any
 * @property preferenceFileInformation Preference file information [PreferenceFileInformation] of the settings item.
 */
data class SettingsSearchItem(
    val title: String,
    val summary: String,
    val preferenceKey: String,
    val breadcrumbs: List<String>,
    val preferenceFileInformation: PreferenceFileInformation,
) {

    /**
     * Copy this [SettingsSearchItem] with the given parameters replaced.
     *
     * @param title New title [String].
     * @param summary New summary [String].
     * @param preferenceKey New preference key [String].
     * @param breadcrumbs New breadcrumbs [List] of [String]s.
     * @param preferenceFileInformation New preference file information [PreferenceFileInformation].
     * @return New [SettingsSearchItem] with the given parameters replaced.
     */
    fun copyWith(
        title: String? = null,
        summary: String? = null,
        preferenceKey: String? = null,
        breadcrumbs: List<String>? = null,
        preferenceFileInformation: PreferenceFileInformation? = null,
    ): SettingsSearchItem {
        return SettingsSearchItem(
            title = title ?: this.title,
            summary = summary ?: this.summary,
            preferenceKey = preferenceKey ?: this.preferenceKey,
            breadcrumbs = breadcrumbs ?: this.breadcrumbs,
            preferenceFileInformation = preferenceFileInformation ?: this.preferenceFileInformation,
        )
    }
}
