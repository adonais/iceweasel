/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabgroups.storage.data

import mozilla.components.feature.tabgroups.storage.database.StoredTabGroup

/** Converts the public [TabGroup] model so it can be saved to disk. */
internal fun TabGroup.toStoredTabGroup(): StoredTabGroup =
    StoredTabGroup(
        id = id,
        title = title,
        theme = theme,
        closed = closed,
        lastModified = lastModified,
    )

/**
 * Converts a [StoredTabGroup] so it can be emitted from the storage layer.
 *
 * @param tabIds The list of tab IDs that are assigned to this group.
 */
internal fun StoredTabGroup.toTabGroup(tabIds: List<String>): TabGroup =
    TabGroup(
        id = id,
        title = title,
        theme = theme,
        closed = closed,
        lastModified = lastModified,
        tabIds = tabIds,
    )
