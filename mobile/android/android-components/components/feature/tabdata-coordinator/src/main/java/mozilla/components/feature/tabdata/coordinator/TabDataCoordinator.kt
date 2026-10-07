/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted.Companion.Eagerly
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.feature.tabdata.coordinator.data.Tab
import mozilla.components.feature.tabdata.coordinator.data.TabGroup
import mozilla.components.feature.tabdata.coordinator.data.TabsSnapshot
import mozilla.components.feature.tabdata.coordinator.repository.TabRepository
import mozilla.components.feature.tabgroups.storage.data.TabGroup as StoredTabGroup
import mozilla.components.feature.tabgroups.storage.data.TabGroupData
import mozilla.components.feature.tabgroups.storage.repository.TabGroupRepository

/** Value class representing the combined data model of all tab data inputs before being transformed. */
@JvmInline
private value class CombinedTabData(private val combinedData: Pair<TabRepository.Data, TabGroupData>) {
    val tabs: List<Tab>
        get() = combinedData.first.tabs

    val selectedTabId: String?
        get() = combinedData.first.selectedTabId

    val tabGroups: List<StoredTabGroup>
        get() = combinedData.second.tabGroups

    val tabGroupAssignments: Map<String, String> // tab ID -> tab group ID
        get() = combinedData.second.tabGroupAssignments
}

/** Abstraction for observing and updating tab data. */
interface TabDataCoordinator {

    /**
     * The [StateFlow] which emits the [TabsSnapshot] transformed from various tab data sources. Emits null when it's
     * not fully initialized.
     */
    val tabsSnapshot: StateFlow<TabsSnapshot?>

    /** Initializes the coordinator so it starts collecting from its aggregate of data sources. */
    fun initialize()
}

/**
 * The default implementation of [TabDataCoordinator].
 *
 * @param tabRepository Repository used to observe, and perform updates to, tab data.
 * @param tabGroupRepository Repository used to observe, and perform updates to, tab group data.
 * @param isInactiveTabsEnabled Fetch whether the inactive tabs feature is enabled.
 * @param isTabGroupsEnabled Fetch whether the tab groups feature is enabled.
 * @param scope [CoroutineScope] used to transform the data sources inputs into an outputted [StateFlow].
 * @param dispatcher [CoroutineDispatcher] the tab data transformation is performed on.
 */
class DefaultTabDataCoordinator(
    private val tabRepository: TabRepository,
    private val tabGroupRepository: TabGroupRepository,
    private val isInactiveTabsEnabled: () -> Boolean,
    private val isTabGroupsEnabled: () -> Boolean,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
) : TabDataCoordinator {

    private val combinedDataFlow: StateFlow<CombinedTabData?> by lazy {
        combine(
                flow = tabRepository.tabFlow.distinctUntilChanged(),
                flow2 = tabGroupRepository.tabGroupDataFlow.distinctUntilChanged(),
            ) { tabData, tabGroupData ->
                CombinedTabData(combinedData = Pair(tabData, tabGroupData))
            }
            .flowOn(dispatcher)
            .stateIn(
                scope = scope,
                started = Eagerly,
                initialValue = null,
            )
    }

    override val tabsSnapshot: StateFlow<TabsSnapshot?>
        field = MutableStateFlow<TabsSnapshot?>(null)

    override fun initialize() {
        scope.launch {
            combinedDataFlow.filterNotNull().collect { data ->
                withContext(dispatcher) {
                    val transformedTabData = transformTabData(tabData = data)
                    tabsSnapshot.emit(transformedTabData)
                }
            }
        }
    }

    /** Transforms the inputted data into the final [TabsSnapshot] model. */
    private fun transformTabData(tabData: CombinedTabData): TabsSnapshot {
        val isInactiveTabsEnabled = isInactiveTabsEnabled()
        val isTabGroupsEnabled = isTabGroupsEnabled()
        val privateTabs = tabData.tabs.filter { tab -> tab.private }
        val (normalTabsWithGroupAssignments, closedTabGroupIds, transformedTabGroups) =
            processTabGroups(tabData = tabData)
        val inactiveTabs =
            if (isInactiveTabsEnabled) {
                normalTabsWithGroupAssignments.filter { it.inactive }
            } else {
                emptyList()
            }
        val browsableNormalTabs =
            filterBrowsableTabsFromNormalTabs(
                normalTabs = normalTabsWithGroupAssignments,
                closedTabGroupIds = closedTabGroupIds,
            )
        val selectedTab =
            normalTabsWithGroupAssignments.find { it.id == tabData.selectedTabId }
                ?: privateTabs.find { it.id == tabData.selectedTabId }

        return TabsSnapshot(
            selectedTab = selectedTab,
            normalTabs = normalTabsWithGroupAssignments,
            browsableNormalTabs = browsableNormalTabs,
            privateTabs = privateTabs,
            inactiveTabs = inactiveTabs,
            tabGroups = transformedTabGroups,
            openTabGroups = transformedTabGroups.filter { !it.closed },
            inactiveTabsEnabled = isInactiveTabsEnabled,
            tabGroupsEnabled = isTabGroupsEnabled,
        )
    }

    /**
     * Returns the processed tab group data.
     * - List of normal tabs with their tab group assignment.
     * - Set of IDs of closed tab groups.
     * - List of tab groups with their list of tab IDs.
     *
     * If the tab groups feature is disabled, empty tab group lists will be returned and the normal tabs will not be
     * assigned to their groups, if assigned.
     */
    private fun processTabGroups(tabData: CombinedTabData): Triple<List<Tab>, Set<String>, List<TabGroup>> {
        val normalTabsWithoutAssignments = tabData.tabs.filter { tab -> !tab.private }
        val normalTabsWithGroupAssignments: List<Tab>
        val closedTabGroupIds: Set<String>
        val transformedTabGroups: List<TabGroup>

        if (isTabGroupsEnabled()) {
            closedTabGroupIds = tabData.tabGroups.filter { it.closed }.mapTo(mutableSetOf()) { it.id }
            transformedTabGroups =
                tabData.tabGroups.map { group ->
                    TabGroup(
                        id = group.id,
                        title = group.title,
                        theme = group.theme,
                        closed = group.closed,
                        lastModified = group.lastModified,
                        tabIds = group.confirmedTabGroupAssignments(tabList = tabData.tabs),
                    )
                }
            normalTabsWithGroupAssignments = normalTabsWithoutAssignments.map { tab ->
                val tabGroupId: String? = tabData.tabGroupAssignments[tab.id]
                if (tabGroupId == tab.tabGroupId) {
                    tab
                } else {
                    tab.copy(tabGroupId = tabGroupId)
                }
            }
        } else {
            closedTabGroupIds = emptySet()
            transformedTabGroups = emptyList()
            normalTabsWithGroupAssignments = normalTabsWithoutAssignments
        }

        return Triple(normalTabsWithGroupAssignments, closedTabGroupIds, transformedTabGroups)
    }

    /**
     * Filters the normal tabs that should not be considered in features that rely on filtered-out tabs.
     *
     * @return The list of normal tabs that are NOT inactive OR assigned to a closed tab group
     */
    private fun filterBrowsableTabsFromNormalTabs(
        normalTabs: List<Tab>,
        closedTabGroupIds: Set<String>,
    ): List<Tab> {
        return normalTabs.filterNot { tab ->
            (isInactiveTabsEnabled() && tab.inactive) || tab.tabGroupId in closedTabGroupIds
        }
    }
}

/**
 * Only return the IDs of the group's tabs that exist from the tab data source.
 *
 * There's a chance that the tab data source has updated before the tab group data source has been updated, so filter
 * out the tabs that may no longer exist.
 */
private fun StoredTabGroup.confirmedTabGroupAssignments(tabList: List<Tab>): List<String> {
    val groupDatabaseAssignments = tabIds.toHashSet()
    return tabList.filter { it.id in groupDatabaseAssignments }.map { it.id }
}
