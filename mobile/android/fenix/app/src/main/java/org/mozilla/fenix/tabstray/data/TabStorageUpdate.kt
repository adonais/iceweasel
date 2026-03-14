/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

/**
 * Data entity representing an update from the tab storage layer.
 *
 * @property selectedTabId The ID of the selected tab. Null if there is no tab selected (when no tabs are open).
 * @property normalTabs The list of normal [TabsTrayItem]s to display in the Tabs Tray.
 * @property inactiveTabs The list of inactive [TabsTrayItem.Tab]s to display in the Tabs Tray.
 * @property privateTabs The list of private [TabsTrayItem]s to display in the Tabs Tray.
 * @property tabGroups The list of [TabsTrayItem.TabGroup]s to display in the Tabs Tray.
 */
data class TabStorageUpdate(
    val selectedTabId: String?,
    val normalTabs: List<TabsTrayItem>,
    val inactiveTabs: List<TabsTrayItem.Tab>,
    val privateTabs: List<TabsTrayItem>,
    val tabGroups: List<TabsTrayItem.TabGroup>,
)
