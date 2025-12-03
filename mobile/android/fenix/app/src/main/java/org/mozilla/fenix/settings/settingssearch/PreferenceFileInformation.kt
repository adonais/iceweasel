/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import org.mozilla.fenix.R

/**
 * Data class for a settings search item navigation information based on the xml file it comes from.
 *
 * @property xmlResourceId The resource ID of the xml file that the item comes from.
 * @property topBreadcrumbResourceId The top breadcrumb of the item as a string resource.
 * @property fragmentId The fragment ID of the fragment where the item is displayed.
 */
sealed class PreferenceFileInformation(
    val xmlResourceId: Int,
    val topBreadcrumbResourceId: Int,
    val fragmentId: Int,
) {

    /**
     * Represents the main "General" settings screen.
     */
    object GeneralPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.preferences,
        topBreadcrumbResourceId = R.string.settings_title,
        fragmentId = R.id.settingsFragment,
    )

    /**
     * Represents the "Accessibility" settings screen.
     */
    object AccessibilityPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.accessibility_preferences,
        topBreadcrumbResourceId = R.string.preferences_accessibility,
        fragmentId = R.id.accessibilityFragment,
    )

    /**
     * Represents the "Autofill" settings screen.
     */
    object AutofillPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.autofill_preferences,
        topBreadcrumbResourceId = R.string.preferences_autofill,
        fragmentId = R.id.autofill_graph,
    )

    /**
     * Represents the "Customization" settings screen.
     */
    object CustomizationPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.customization_preferences,
        topBreadcrumbResourceId = R.string.preferences_customize,
        fragmentId = R.id.customizationFragment,
    )

    /**
     * Represents the "Default Search Engine" settings screen.
     */
    object DefaultSearchEnginePreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.default_search_engine_preferences,
        topBreadcrumbResourceId = R.string.preferences_default_search_engine,
        fragmentId = R.id.search_engine_graph,
    )

    /**
     * Represents the "Downloads" settings screen.
     */
    object DownloadsSettingsPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.downloads_settings_preferences,
        topBreadcrumbResourceId = R.string.preferences_downloads,
        fragmentId = R.id.downloadsFragment,
    )

    /**
     * Represents the "Home" settings screen.
     */
    object HomePreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.home_preferences,
        topBreadcrumbResourceId = R.string.preferences_home_2,
        fragmentId = R.id.homeSettingsFragment,
    )

    /**
     * Represents the "Open Links in Apps" settings screen.
     */
    object OpenLinksInAppsPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.open_links_in_apps_preferences,
        topBreadcrumbResourceId = R.string.preferences_open_links_in_apps,
        fragmentId = R.id.openLinksInAppsFragment,
    )

    /**
     * Represents the "Private Browsing" settings screen.
     */
    object PrivateBrowsingPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.private_browsing_preferences,
        topBreadcrumbResourceId = R.string.preferences_private_browsing_options,
        fragmentId = R.id.privateBrowsingFragment,
    )

    /**
     * Represents the "Search Settings" settings screen.
     */
    object SearchSettingsPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.search_settings_preferences,
        topBreadcrumbResourceId = R.string.preferences_search,
        fragmentId = R.id.search_engine_graph,
    )

    /**
     * Represents the "Tabs" settings screen.
     */
    object TabsPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.tabs_preferences,
        topBreadcrumbResourceId = R.string.preferences_tabs,
        fragmentId = R.id.tabsSettingsFragment,
    )

    /**
     * Represents the "Tracking Protection" settings screen.
     */
    object TrackingProtectionPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.tracking_protection_preferences,
        topBreadcrumbResourceId = R.string.preference_enhanced_tracking_protection,
        fragmentId = R.id.trackingProtectionFragment,
    )

    /**
     * Represents the "Save Logins" settings screen.
     */
    object SaveLoginsPreferences : PreferenceFileInformation(
        xmlResourceId = R.xml.save_logins_preferences,
        topBreadcrumbResourceId = R.string.preferences_passwords_save_logins_2,
        fragmentId = R.id.savedLogins,
    )
}
