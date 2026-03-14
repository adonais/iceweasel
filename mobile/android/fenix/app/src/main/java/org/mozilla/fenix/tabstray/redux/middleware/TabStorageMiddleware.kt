/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.middleware

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.repository.TabGroupRepository
import org.mozilla.fenix.tabstray.data.TabData
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabStorageUpdate
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction.InitAction
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction.TabDataUpdateReceived
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction.TabsStorageAction
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState

private typealias TabItemId = String
private typealias TabGroupMap = HashMap<TabItemId, TabsTrayItem.TabGroup>

/**
 * [Middleware] that reacts to [TabsTrayAction] and performs storage side effects.
 *
 * @param inactiveTabsEnabled Whether the inactive tabs feature is enabled.
 * @param tabGroupsEnabled Whether the inactive tabs feature is enabled.
 * @param tabDataFlow [StateFlow] used to observe tab data.
 * @param tabGroupRepository The [TabGroupRepository] used to read/write tab group data.
 * @param scope The [CoroutineScope] for running the tab data transformation off of the main thread.
 * @param mainScope The [CoroutineScope] used for returning to the main thread.
 **/
class TabStorageMiddleware(
    private val inactiveTabsEnabled: Boolean,
    private val tabGroupsEnabled: Boolean,
    private val tabDataFlow: Flow<TabData>,
    private val tabGroupRepository: TabGroupRepository,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default),
    private val mainScope: CoroutineScope = CoroutineScope(Dispatchers.Main),
) : Middleware<TabsTrayState, TabsTrayAction> {

    private val logger = Logger(tag = "TabStorageMiddleware")

    override fun invoke(
        store: Store<TabsTrayState, TabsTrayAction>,
        next: (TabsTrayAction) -> Unit,
        action: TabsTrayAction,
    ) {
        when (action) {
            is TabsStorageAction -> processAction(
                action = action,
                store = store,
            )

            else -> {}
        }

        next(action)
    }

    private fun processAction(
        action: TabsStorageAction,
        store: Store<TabsTrayState, TabsTrayAction>,
    ) {
        when (action) {
            InitAction -> {
                // Set up the tab data observer and set the Flow collection to the lifetime of main scope
                mainScope.launch {
                    if (tabGroupsEnabled) {
                        combine(
                            flow = tabDataFlow.distinctUntilChanged(),
                            flow2 = tabGroupRepository.observeTabGroups().distinctUntilChanged(),
                            flow3 = tabGroupRepository.observeTabGroupAssignments().distinctUntilChanged(),
                        ) { tabData, tabGroups, tabGroupAssignments ->
                            Triple(tabData, tabGroups, tabGroupAssignments)
                        }.collect { data ->
                            scope.launch {
                                val transformedTabData = transformTabData(
                                    tabData = data.first,
                                    tabGroups = data.second,
                                    tabGroupAssignments = data.third,
                                )

                                mainScope.launch {
                                    store.dispatch(TabDataUpdateReceived(tabStorageUpdate = transformedTabData))
                                }
                            }
                        }
                    } else {
                        tabDataFlow
                            .distinctUntilChanged()
                            .collect { tabData ->
                                scope.launch {
                                    val tabData = transformTabData(
                                        tabData = tabData,
                                        tabGroups = emptyList(),
                                        tabGroupAssignments = emptyMap(),
                                    )

                                    mainScope.launch {
                                        store.dispatch(TabDataUpdateReceived(tabStorageUpdate = tabData))
                                    }
                                }
                            }
                    }
                }
            }
        }
    }

    private fun transformTabData(
        tabData: TabData,
        tabGroups: List<StoredTabGroup>,
        tabGroupAssignments: Map<TabItemId, String>,
    ): TabStorageUpdate {
        val normalTabs: MutableList<TabsTrayItem> = mutableListOf()
        val inactiveTabs: MutableList<TabsTrayItem.Tab> = mutableListOf()
        val privateTabs: MutableList<TabsTrayItem> = mutableListOf()
        val transformedTabGroups = constructTabGroupMaps(tabGroups = tabGroups)
        val groupsIncludedInNormalTabs = hashSetOf<TabItemId>()

        tabData.tabs.forEach { tab ->
            val displayTab = TabsTrayItem.Tab(tab = tab)
            val assignedGroup = getAssignedGroup(
                tabItemId = displayTab.id,
                tabGroupAssignments = tabGroupAssignments,
                tabGroups = transformedTabGroups,
            )

            when {
                assignedGroup != null -> {
                    assignedGroup.tabs.add(displayTab)

                    // We need to separately check & track if the group has already been added to the
                    // collection of Normal tab items because normalTabs does not maintain a sort key
                    // and cannot be backed by a Map/Set.
                    if (!assignedGroup.closed && assignedGroup.id !in groupsIncludedInNormalTabs) {
                        normalTabs.add(assignedGroup)
                        groupsIncludedInNormalTabs.add(assignedGroup.id)
                    }
                }
                displayTab.private -> privateTabs.add(displayTab)
                inactiveTabsEnabled && displayTab.inactive -> inactiveTabs.add(displayTab)
                else -> normalTabs.add(displayTab)
            }
        }

        return TabStorageUpdate(
            selectedTabId = tabData.selectedTabId,
            normalTabs = normalTabs,
            inactiveTabs = inactiveTabs,
            privateTabs = privateTabs,
            tabGroups = transformedTabGroups.values.toList(),
        )
    }

    private fun getAssignedGroup(
        tabItemId: TabItemId,
        tabGroupAssignments: Map<TabItemId, String>,
        tabGroups: TabGroupMap,
    ): TabsTrayItem.TabGroup? {
        if (!tabGroupsEnabled) return null
        val groupId = tabGroupAssignments[tabItemId]
        return tabGroups[groupId]
    }

    private fun constructTabGroupMaps(
        tabGroups: List<StoredTabGroup>,
    ): TabGroupMap {
        val transformedTabGroups: TabGroupMap = hashMapOf()

        tabGroups.forEach { tabGroup ->
            val safeTheme = tabGroup.theme.toTabGroupTheme()

            transformedTabGroups[tabGroup.id] = TabsTrayItem.TabGroup(
                id = tabGroup.id,
                theme = safeTheme,
                title = tabGroup.title,
                tabs = hashSetOf(),
                closed = tabGroup.closed,
            )
        }

        return transformedTabGroups
    }

    internal fun String.toTabGroupTheme() = try {
        TabGroupTheme.valueOf(this)
    } catch (_: IllegalArgumentException) {
        logger.info(message = "Failed to parse TabGroupTheme: $this")
        TabGroupTheme.default
    }
}
