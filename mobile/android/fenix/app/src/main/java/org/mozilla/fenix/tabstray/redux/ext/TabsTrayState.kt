/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.ext

import org.mozilla.fenix.tabstray.data.TabStorageUpdate
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState

internal fun TabsTrayState.withStorageUpdate(storageUpdate: TabStorageUpdate) =
    copy(
        selectedTabId = storageUpdate.selectedTabId,
        normalTabsState =
            normalTabsState.copy(
                items = storageUpdate.normalItems,
                selectedItemIndex = storageUpdate.selectedNormalItemIndex,
                tabCount = storageUpdate.normalTabCount,
            ),
        inactiveTabs = inactiveTabs.copy(tabs = storageUpdate.inactiveTabs),
        privateBrowsing =
            privateBrowsing.copy(
                tabs = storageUpdate.privateTabs,
                selectedItemIndex = storageUpdate.selectedPrivateItemIndex,
            ),
        tabGroupState = tabGroupState.copy(groups = storageUpdate.tabGroups),
        hasTabDataLoaded = true,
    )
