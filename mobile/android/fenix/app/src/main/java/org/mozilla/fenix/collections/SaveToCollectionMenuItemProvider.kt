/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.collections

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.TabCollectionStorage
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.utils.Settings

/**
 * [MenuItemProvider] for the menu item allowing to add the current webpage to a collection.
 *
 * @param settings [Settings] used to check whether the collections feature is enabled or not.
 * @param tabCollectionStorage [TabCollectionStorage] allowing to check what collections currently exist.
 */
class SaveToCollectionMenuItemProvider(
    settings: Settings,
    tabCollectionStorage: TabCollectionStorage,
) : MenuItemProvider {
    override val itemFlow: StateFlow<MenuItem?> =
        MutableStateFlow(
            if (settings.collections) {
                StandardMenuItem(
                    title = Text.Resource(R.string.browser_menu_save_to_collection_2),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_collection_24),
                    onClickEvent =
                        MenuAction.Navigate.SaveToCollection(
                            hasCollection = tabCollectionStorage.cachedTabCollections.isNotEmpty()
                        ),
                )
            } else {
                null
            }
        )
}
