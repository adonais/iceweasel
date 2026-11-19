/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.data

import android.graphics.Bitmap

/**
 * Data model of a browser tab, representing the minimal data necessary to display a tab in the UI.
 *
 * For deeper tab data modeling, please access [TabSessionState] via [BrowserState] instead.
 *
 * @property id The ID of the tab.
 * @property url The URL of the tab.
 * @property title The display-friendly title of the tab.
 * @property private Whether the tab is private.
 * @property inactive Whether the tab is inactive.
 * @property icon The tab's favicon.
 * @property isMediaActive Whether the tab is currently playing media.
 * @property lastAccess Timestamp of the last time this tab was accessed.
 * @property tabGroupId The ID of the group this tab belongs to. Null if the tab is not grouped.
 */
data class Tab(
    val id: String,
    val url: String,
    val title: String,
    val private: Boolean,
    val inactive: Boolean,
    val icon: Bitmap? = null,
    val isMediaActive: Boolean = false,
    val lastAccess: Long = 0L,
    val tabGroupId: String? = null,
)
