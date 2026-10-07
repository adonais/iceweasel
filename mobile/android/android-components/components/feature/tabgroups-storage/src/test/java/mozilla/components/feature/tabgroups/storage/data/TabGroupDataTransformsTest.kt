/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabgroups.storage.data

import kotlin.test.Test
import kotlin.test.assertEquals
import mozilla.components.feature.tabgroups.storage.database.StoredTabGroup

class TabGroupDataTransformsTest {

    @Test
    fun `WHEN a tab group is being saved to disk THEN convert it into the correct data model`() {
        val initialTabGroup =
            TabGroup(
                title = "title",
                theme = "theme",
                closed = false,
                lastModified = 10L,
                tabIds = emptyList(),
            )
        val expectedStoredTabGroup =
            StoredTabGroup(
                id = initialTabGroup.id,
                title = initialTabGroup.title,
                theme = initialTabGroup.theme,
                closed = initialTabGroup.closed,
                lastModified = initialTabGroup.lastModified,
            )
        assertEquals(expectedStoredTabGroup, initialTabGroup.toStoredTabGroup())
    }

    @Test
    fun `WHEN a tab group is being emitted from the storage layer THEN convert it into the correct data model`() {
        val initialStoredTabGroup =
            StoredTabGroup(
                id = "123",
                title = "title",
                theme = "theme",
                closed = false,
                lastModified = 10L,
            )
        val expectedTabIDs = listOf("tab1", "tab2")
        val expectedTabGroup =
            TabGroup(
                id = initialStoredTabGroup.id,
                title = initialStoredTabGroup.title,
                theme = initialStoredTabGroup.theme,
                closed = initialStoredTabGroup.closed,
                lastModified = initialStoredTabGroup.lastModified,
                tabIds = expectedTabIDs,
            )
        assertEquals(expectedTabGroup, initialStoredTabGroup.toTabGroup(tabIds = expectedTabIDs))
    }
}
