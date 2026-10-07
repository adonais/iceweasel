/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import mozilla.components.support.ktx.kotlin.tryGetHostFromUrl

/**
 * A default top site as it appears in the raw resource.
 *
 * @property url The URL of the top site.
 * @property title The title to display or null to fall back to the site's host.
 * @property order The position that the top site should appear in.
 * @property schema The version of the schema.
 * @property excludeLocales The list of locales that the site is not available in.
 * @property excludeRegions The list of regions that the site is not available in.
 * @property includeLocales The list of locales that the site is available in or empty for all locales.
 * @property includeRegions The list of regions that the site is available in or empty for all regions.
 * @property excludeExperiments The list of experiments that exclude the site when enrolled.
 * @property includeExperiments The list of experiments that the site is available in when enrolled.
 * @property id The ID of this top site.
 * @property lastModified The last modified time of this top site.
 * @property searchShortcut Whether the site is a search shortcut.
 */
@Serializable
internal data class DefaultTopSiteItem(
    val url: String,
    val title: String? = null,
    val order: Int,
    val schema: Long,
    @SerialName("exclude_locales") val excludeLocales: List<String> = emptyList(),
    @SerialName("exclude_regions") val excludeRegions: List<String> = emptyList(),
    @SerialName("include_locales") val includeLocales: List<String> = emptyList(),
    @SerialName("include_regions") val includeRegions: List<String> = emptyList(),
    @SerialName("exclude_experiments") val excludeExperiments: List<String> = emptyList(),
    @SerialName("include_experiments") val includeExperiments: List<String> = emptyList(),
    val id: String,
    @SerialName("last_modified") val lastModified: Long,
    @SerialName("search_shortcut") val searchShortcut: Boolean = false,
)

/**
 * List holding the default top sites.
 *
 * @property data The list of default top sites that the resource provides.
 */
@Serializable internal data class DefaultTopSitesList(val data: List<DefaultTopSiteItem>)

/**
 * A default top site containing only the information needed to be added as a top site.
 *
 * @property title The title to display.
 * @property url The URL of the site.
 */
internal data class DefaultTopSite(val title: String, val url: String)

/** The title to display for this top site. Falls back to its host when no title is available. */
internal fun DefaultTopSiteItem.displayTitle(): String = title?.takeIf(String::isNotBlank) ?: url.tryGetHostFromUrl()

internal fun DefaultTopSiteItem.toDefaultTopSite(): DefaultTopSite = DefaultTopSite(title = displayTitle(), url = url)
