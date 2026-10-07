/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.fenix.tabgroups.flow

import mozilla.components.lib.state.State
import org.mozilla.fenix.tabgroups.TabGroupTelemetry
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.redux.state.TabGroupFormState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.redux.state.newTabGroupForm

/**
 * @property backStack The flow's backstack
 * @property groups The list of tab groups.
 * @property formState The state of the tab group edit form.
 * @property config The [Config] for the flow.
 */
data class TabGroupFlowState(
    val backStack: List<TabGroupFlowDestination> = listOf(TabGroupFlowDestination.Root),
    override val groups: List<TabsTrayItem.TabGroup> = emptyList(),
    override val formState: TabGroupFormState? = null,
    val config: Config = Config(),
) : State, TabGroupTelemetry.TabGroupTelemetryContext {
    /** Drops the last entry of [TabsTrayState.backStack]. If [backStack] only has one entry, no changes occur. */
    internal fun popBackStack(): List<TabGroupFlowDestination> =
        if (backStack.size > 1) {
            backStack.dropLast(1)
        } else {
            backStack
        }

    /**
     * Configuration for the flow of Tab Groups outside the TabsTray.
     *
     * @property displayTabsInGrid Whether the group's tabs are displayed in a grid (vs list).
     * @property homepageAsNewTabEnabled Whether the homepage as a new tab feature is enabled, which gates the ability
     *   to open new tabs within an expanded tab group.
     */
    data class Config(
        val displayTabsInGrid: Boolean = false,
        val homepageAsNewTabEnabled: Boolean = false,
    )
}

/** Returns an initial [TabGroupFormState] derived from [TabGroupFlowState]. */
fun TabGroupFlowState.initializeTabGroupForm(isStarterTabGroup: Boolean = false) =
    newTabGroupForm(existingGroups = groups, isStarterTabGroup = isStarterTabGroup)
