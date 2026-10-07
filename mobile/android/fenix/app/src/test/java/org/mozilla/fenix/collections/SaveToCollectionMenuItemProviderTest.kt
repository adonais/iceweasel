/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.collections

import io.mockk.every
import io.mockk.mockk
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.TabCollectionStorage
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.utils.Settings

class SaveToCollectionMenuItemProviderTest {
    @Test
    fun `GIVEN the collections feature is disabled WHEN building the menu button THEN return null`() {
        val settings: Settings = mockk {
            every { collections } returns false
        }

        val provider = SaveToCollectionMenuItemProvider(settings, mockk())

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the collections feature is enabled and collections exist WHEN building the menu button THEN return a menu item`() {
        val settings: Settings = mockk {
            every { collections } returns true
        }
        val tabCollectionStorage: TabCollectionStorage = mockk {
            every { cachedTabCollections } returns listOf(mockk())
        }

        val provider = SaveToCollectionMenuItemProvider(settings, tabCollectionStorage)

        assertEquals(expectedMenuItem(true), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the collections feature is enabled and collections don't exist WHEN building the menu button THEN return a menu item`() {
        val settings: Settings = mockk {
            every { collections } returns true
        }
        val tabCollectionStorage: TabCollectionStorage = mockk {
            every { cachedTabCollections } returns emptyList()
        }

        val provider = SaveToCollectionMenuItemProvider(settings, tabCollectionStorage)

        assertEquals(expectedMenuItem(false), provider.itemFlow.value)
    }

    private fun expectedMenuItem(collectionsAlreadyExist: Boolean) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_save_to_collection_2),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_collection_24),
            onClickEvent = MenuAction.Navigate.SaveToCollection(hasCollection = collectionsAlreadyExist),
        )
}
