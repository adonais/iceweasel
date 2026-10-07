/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.data

/**
 * Data entity representing a tab group.
 *
 * @property id The ID of the tab group.
 * @property title The title of the tab group.
 * @property theme The theme of the tab group. The string maps to a theme value in the UI.
 * @property closed Whether the group is closed.
 * @property lastModified Timestamp indicating the last time this group was updated.
 * @property tabIds The collection of tab IDs that belong to this group.
 */
data class TabGroup(
    val id: String,
    val title: String,
    val theme: String,
    val closed: Boolean,
    val lastModified: Long,
    val tabIds: List<String>,
)
