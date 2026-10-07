/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.data

/**
 * Data class containing the current snapshot of tab data.
 *
 * @property selectedTab The active [Tab] in the browser.
 * @property normalTabs The complete collection of normal browsing [Tab]s.
 * @property browsableNormalTabs The collection of normal browsing [Tab]s which are neither inactive nor belong to a
 *   closed tab group. This factors in whether each respective feature is enabled.
 * @property privateTabs The collection of private browsing [Tab]s.
 * @property inactiveTabs The complete collection of normal browsing [Tab]s which are inactive.
 * @property tabGroups The complete collection of [TabGroup]s.
 * @property openTabGroups The complete collection of open [TabGroup]s.
 * @property inactiveTabsEnabled Whether the inactive tabs feature is enabled.
 * @property tabGroupsEnabled Whether the tab groups feature is enabled.
 */
data class TabsSnapshot(
    val selectedTab: Tab? = null,
    val normalTabs: List<Tab> = emptyList(),
    val browsableNormalTabs: List<Tab> = emptyList(),
    val privateTabs: List<Tab> = emptyList(),
    val inactiveTabs: List<Tab> = emptyList(),
    val tabGroups: List<TabGroup> = emptyList(),
    val openTabGroups: List<TabGroup> = emptyList(),
    val inactiveTabsEnabled: Boolean = true,
    val tabGroupsEnabled: Boolean = true,
)
