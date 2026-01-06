/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Resources
import android.content.res.XmlResourceParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.mozilla.fenix.R
import java.io.IOException

/**
 * Indexes Settings preferences for the Settings Search screen.
 *
 * All the preference files that are parsed and indexed are listed in the companion object.
 */
class DefaultFenixSettingsIndexer(private val context: Context) : SettingsIndexer {
    private val settings: MutableList<SettingsSearchItem> = mutableListOf()

    /**
     * Index all settings.
     */
    override fun indexAllSettings() {
        settings.clear()

        for (preferenceFileInformation in preferenceFileInformationList) {
            val settingFileParser = getXmlParserForFile(preferenceFileInformation.xmlResourceId)
            if (settingFileParser != null) {
                parseXmlFile(settingFileParser, preferenceFileInformation)
            }
        }
    }

    /**
     * Get settings filtered by query.
     *
     * @param query Query [String] to filter by.
     * @return List of [SettingsSearchItem]s that match the query.
     */
    override suspend fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        if (query.isBlank()) return emptyList()

        val trimmedQuery = query.trim()

        return withContext(Dispatchers.Default) {
            settings.distinctBy { it.preferenceKey }.filter { item ->
                item.title.contains(trimmedQuery, ignoreCase = true)
            }
        }
    }

    private fun getXmlParserForFile(xmlResourceId: Int): XmlResourceParser? {
        try {
            if (xmlResourceId == 0) return null
            return context.resources.getXml(xmlResourceId)
        } catch (e: Resources.NotFoundException) {
            println("Error: failed to find resource $xmlResourceId. ${e.message}")
        } catch (e: IOException) {
            println("Error: I/O exception while parsing ${e.message}")
        }
        return null
    }

    @Suppress("NestedBlockDepth", "CognitiveComplexMethod")
    private fun parseXmlFile(
        parser: XmlResourceParser,
        preferenceFileInformation: PreferenceFileInformation,
    ) {
        try {
            var eventType = parser.next()
            var categoryItem: SettingsSearchItem? = null
            var categoryItemAdded = false

            while (eventType != XmlResourceParser.END_DOCUMENT) {
                when (eventType) {
                    XmlResourceParser.START_TAG -> {
                        when (parser.name) {
                            PREFERENCE_CATEGORY_TAG -> {
                                categoryItem = createCategoryItem(
                                    parser,
                                    preferenceFileInformation,
                                )
                            }
                            CHECKBOX_PREFERENCE_TAG,
                            CUSTOM_CBH_SWITCH_PREFERENCE_TAG,
                            DEFAULT_BROWSER_PREFERENCE_TAG,
                            PREFERENCE_TAG,
                            SWITCH_PREFERENCE_TAG,
                            SWITCH_PREFERENCE_PLAIN_TAG,
                            TEXT_PERCENTAGE_SEEK_BAR_PREFERENCE_TAG,
                            TOGGLE_RADIO_BUTTON_PREFERENCE_TAG,
                                -> {
                                val item = createSettingsSearchItemFromAttributes(
                                    parser = parser,
                                    preferenceFileInformation = preferenceFileInformation,
                                )
                                    if (item != null) {
                                        settings.add(item)
                                    }
                            }
                            RADIO_BUTTON_PREFERENCE_TAG,
                                -> {
                                if (categoryItem != null && !categoryItemAdded) {
                                    categoryItemAdded = true
                                    val preferenceKey = getPreferenceKeyForRadioButtonPref(parser)
                                    settings.add(categoryItem.copy(preferenceKey = preferenceKey ?: ""))
                                    categoryItem = null
                                } else {
                                    val item = createSettingsSearchItemFromAttributes(
                                        parser,
                                        preferenceFileInformation,
                                    )
                                    if (item != null) {
                                        settings.add(item)
                                    }
                                }
                            }
                        }
                    }
                    XmlResourceParser.END_TAG -> {
                        when (parser.name) {
                            PREFERENCE_CATEGORY_TAG -> {
                                categoryItem = null
                                categoryItemAdded = false
                            }
                        }
                    }
                }
                eventType = parser.next()
            }
        } catch (e: IOException) {
            println("Error: I/O exception while parsing ${e.message}")
        } finally {
            parser.close()
        }
    }

    private fun createSettingsSearchItemFromAttributes(
        parser: XmlResourceParser,
        preferenceFileInformation: PreferenceFileInformation,
    ): SettingsSearchItem? {
        var key: String? = null
        var title: String? = null
        var summary = ""

        for (i in 0 until parser.attributeCount) {
            val attributeName = parser.getAttributeName(i)
            val attributeValue = parser.getAttributeValue(i)

            when (attributeName) {
                KEY_ATTRIBUTE_NAME -> {
                    key = attributeValue.takeIf { it.isNotBlank() }
                        ?.substring(1)
                        ?.let { getStringResource(it) }
                }
                TITLE_ATTRIBUTE_NAME -> {
                    title = attributeValue.takeIf { it.isNotBlank() }
                        ?.substring(1)
                        ?.let { getStringResource(it) }
                }
                SUMMARY_ATTRIBUTE_NAME -> {
                    summary = attributeValue.takeIf { it.isNotBlank() }
                        ?.substring(1)
                        ?.let { getStringResource(it) }
                        ?: ""
                }
                IS_VISIBLE_ATTRIBUTE_NAME -> {
                    if (attributeValue == "false") {
                        return null
                    }
                }
            }
        }

        val categoryHeader = context.getString(preferenceFileInformation.categoryHeaderResourceId)

        if (key == null || title == null) return null

        return SettingsSearchItem(
            preferenceKey = key,
            title = title,
            summary = summary,
            categoryHeader = categoryHeader,
            preferenceFileInformation = preferenceFileInformation,
        )
    }

    /**
     * Create a category item in case the category contains only radio buttons.
     *
     * The category item will be the reference for searching and the first radio button
     * in the category will be used for navigation.
     *
     * @param parser [XmlResourceParser] for the category.
     * @param preferenceFileInformation [PreferenceFileInformation] for the category.
     */
    private fun createCategoryItem(
        parser: XmlResourceParser,
        preferenceFileInformation: PreferenceFileInformation,
    ): SettingsSearchItem? {
        var key: String? = null
        var title: String? = null
        var summary = ""

        for (i in 0 until parser.attributeCount) {
            val attributeName = parser.getAttributeName(i)
            val attributeValue = parser.getAttributeValue(i)

            when (attributeName) {
                KEY_ATTRIBUTE_NAME -> key = getStringResource(attributeValue.substring(1))
                TITLE_ATTRIBUTE_NAME -> title = getStringResource(attributeValue.substring(1))
                SUMMARY_ATTRIBUTE_NAME -> summary = getStringResource(attributeValue.substring(1))
                IS_VISIBLE_ATTRIBUTE_NAME, IS_ENABLED_ATTRIBUTE_NAME -> {
                    if (attributeValue == "false") {
                        return null
                    }
                }
            }
        }

        val categoryHeader = context.getString(preferenceFileInformation.categoryHeaderResourceId)

        return SettingsSearchItem(
            preferenceKey = key ?: "",
            title = title ?: "",
            summary = summary,
            categoryHeader = categoryHeader,
            preferenceFileInformation = preferenceFileInformation,
        )
    }

    /**
     * Get the preference key for a radio button preference.
     *
     * @param parser [XmlResourceParser] for the radio button preference.
     */
    private fun getPreferenceKeyForRadioButtonPref(parser: XmlResourceParser): String? {
        var key: String? = null
        for (i in 0 until parser.attributeCount) {
            val attributeName = parser.getAttributeName(i)
            val attributeValue = parser.getAttributeValue(i)

            when (attributeName) {
                KEY_ATTRIBUTE_NAME -> key = getStringResource(attributeValue.substring(1))
            }
        }
        return key
    }

    /**
     * Get the string resource from the given resource name.
     * Uses the locale context.
     *
     * @param resourceName The name of the resource.
     */
    @SuppressLint("DiscouragedApi")
    private fun getStringResource(resourceName: String): String {
        return try {
            val resourceId = context.resources.getIdentifier(
                resourceName,
                "string",
                context.packageName,
            )
            if (resourceId == 0) {
                return ""
            }

            if (stringsWithRequiredFormatting.contains(resourceId)) {
                val appName = context.getString(R.string.app_name)
                context.getString(resourceId, appName)
            } else {
                context.getString(resourceId)
            }
        } catch (e: Resources.NotFoundException) {
            ""
        }
    }

    companion object {
        // Attribute names
        private const val PREFERENCE_CATEGORY_TAG = "androidx.preference.PreferenceCategory"
        private const val CHECKBOX_PREFERENCE_TAG = "androidx.preference.CheckBoxPreference"
        private const val PREFERENCE_TAG = "androidx.preference.Preference"
        private const val SWITCH_PREFERENCE_TAG = "androidx.preference.SwitchPreference"
        private const val SWITCH_PREFERENCE_PLAIN_TAG = "SwitchPreference"
        private const val CUSTOM_CBH_SWITCH_PREFERENCE_TAG =
            "org.mozilla.fenix.settings.cookiebannerhandling.CustomCBHSwitchPreference"
        private const val DEFAULT_BROWSER_PREFERENCE_TAG = "org.mozilla.fenix.settings.DefaultBrowserPreference"
        private const val TEXT_PERCENTAGE_SEEK_BAR_PREFERENCE_TAG =
            "org.mozilla.fenix.settings.TextPercentageSeekBarPreference"
        private const val RADIO_BUTTON_PREFERENCE_TAG = "org.mozilla.fenix.settings.RadioButtonPreference"
        private const val TOGGLE_RADIO_BUTTON_PREFERENCE_TAG = "org.mozilla.fenix.settings.ToggleRadioButtonPreference"
        private const val KEY_ATTRIBUTE_NAME = "key"
        private const val TITLE_ATTRIBUTE_NAME = "title"
        private const val SUMMARY_ATTRIBUTE_NAME = "summary"
        private const val IS_VISIBLE_ATTRIBUTE_NAME = "isPreferenceVisible"
        private const val IS_ENABLED_ATTRIBUTE_NAME = "enabled"

        /**
         * All the preference xml files to load with information for the indexer.
         * In a [List] of [PreferenceFileInformation]s.
         */
        val preferenceFileInformationList = listOf(
            PreferenceFileInformation.GeneralPreferences,
            PreferenceFileInformation.AccessibilityPreferences,
            PreferenceFileInformation.AutofillPreferences,
            PreferenceFileInformation.CustomizationPreferences,
            PreferenceFileInformation.DefaultSearchEnginePreferences,
            PreferenceFileInformation.DownloadsSettingsPreferences,
            PreferenceFileInformation.HomePreferences,
            PreferenceFileInformation.OpenLinksInAppsPreferences,
            PreferenceFileInformation.PrivateBrowsingPreferences,
            PreferenceFileInformation.SearchSettingsPreferences,
            PreferenceFileInformation.SiteSettingsPreferences,
            PreferenceFileInformation.TabsPreferences,
            PreferenceFileInformation.TrackingProtectionPreferences,
            PreferenceFileInformation.SaveLoginsPreferences,
        )

        /**
         * List of strings that require format args.
         *
         * All of them require the app name.
         */
        val stringsWithRequiredFormatting = listOf(
            R.string.preferences_downloads_settings_clean_up_files_title,
            R.string.preferences_show_nonsponsored_suggestions,
            R.string.preferences_about,
        )
    }
}
