/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabgroups.storage.data

import java.util.UUID

/**
 * The complete tab group data model emitted from the storage abstraction layer.
 *
 * @property tabGroups The list of [TabGroup]s emitted from the storage abstraction layer.
 * @property tabGroupAssignments The mapping of tab IDs to tab group IDs emitted from the storage abstraction layer.
 */
data class TabGroupData(
    val tabGroups: List<TabGroup> = emptyList(),
    val tabGroupAssignments: Map<String, String> = emptyMap(), // tab ID -> tab group ID
)

/**
 * Data model of a Tab Group emitted from storage.
 *
 * @property id The ID of the tab group.
 * @property title The display title of the tab group.
 * @property theme The theme of the tab group. The string maps to a theme value in the UI.
 * @property closed Whether the group has been closed by the user.
 * @property lastModified Timestamp indicating the last time this entry was updated.
 * @property tabIds The unordered collection of tab IDs that belong to this group. Tab ordering is owned by the tab data
 *   layer.
 */
data class TabGroup(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val theme: String,
    val closed: Boolean = false,
    val lastModified: Long,
    val tabIds: List<String>,
)
