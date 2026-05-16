/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.reducer

import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.data.createTab
import org.mozilla.fenix.tabstray.data.createTabGroup
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination.AddToTabGroup
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination.DeleteTabGroupConfirmationDialog
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination.EditTabGroup
import org.mozilla.fenix.tabstray.navigation.TabManagerNavDestination.ExpandedTabGroup
import org.mozilla.fenix.tabstray.redux.action.TabGroupAction
import org.mozilla.fenix.tabstray.redux.state.TabGroupFormState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState
import org.mozilla.fenix.tabstray.redux.state.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.redux.state.initializeTabGroupForm

class TabGroupReducerTest {
    @Test
    fun `WHEN NameChanged AND form state exists THEN name is updated and edited is true`() {
        val initialState = TabsTrayState(
            tabGroupState = TabsTrayState.TabGroupState(
                formState = TabGroupFormState(
                    tabGroupId = "1",
                    name = "Previous name",
                    edited = false,
                ),
            ),
        )

        val newName = "New name"

        val resultState = TabGroupActionReducer.reduce(
            initialState,
            TabGroupAction.NameChanged(newName),
        )

        val initialStateForm = requireNotNull(initialState.tabGroupState.formState)
        val expectedState = initialState.copy(
            tabGroupState = TabsTrayState.TabGroupState(
                formState = initialStateForm.copy(
                    name = newName,
                    edited = true,
                ),
            ),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN SaveClicked THEN multi-select mode is exited and the tab group flow is closed`() {
        val formState = TabGroupFormState(
            tabGroupId = "1",
            name = "Tab Group 1",
            edited = true,
        )
        val initialState = TabsTrayState(
            mode = Mode.Select(selectedTabs = setOf()),
            tabGroupState = TabsTrayState.TabGroupState(
                formState = formState,
            ),
            backStack = listOf(
                TabsTrayState().backStack.first(),
                AddToTabGroup,
                EditTabGroup,
            ),
        )

        val resultState = TabGroupActionReducer.reduce(initialState, TabGroupAction.SaveClicked)

        val expectedState = initialState.copy(
            mode = Mode.Normal,
            backStack = TabsTrayState().backStack,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN FormDismissed THEN form state is set to null and the tab group flow is closed`() {
        val initialState = TabsTrayState(
            tabGroupState = TabsTrayState.TabGroupState(
                formState = TabGroupFormState(
                    tabGroupId = "1",
                    name = "Tab Group 1",
                    edited = true,
                ),
            ),
            mode = Mode.Select(selectedTabs = setOf()),
            backStack = listOf(
                TabsTrayState().backStack.first(),
                AddToTabGroup,
                EditTabGroup,
            ),
        )

        val resultState = TabGroupActionReducer.reduce(initialState, TabGroupAction.FormDismissed)

        val expectedState = initialState.copy(
            tabGroupState = initialState.tabGroupState.copy(formState = null),
            backStack = TabsTrayState().backStack,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN FormDismissed from editing an expanded tab group THEN return to the expanded tab group`() {
        val group = createTabGroup()
        val initialState = TabsTrayState(
            tabGroupState = TabsTrayState.TabGroupState(
                formState = TabGroupFormState(
                    tabGroupId = group.id,
                    name = group.title,
                    edited = true,
                ),
            ),
            backStack = listOf(
                TabsTrayState().backStack.first(),
                ExpandedTabGroup(group = group),
                EditTabGroup,
            ),
        )

        val resultState = TabGroupActionReducer.reduce(initialState, TabGroupAction.FormDismissed)

        val expectedState = initialState.copy(
            tabGroupState = initialState.tabGroupState.copy(
                formState = null,
            ),
            backStack = listOf(
                TabsTrayState().backStack.first(),
                ExpandedTabGroup(group = group),
            ),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `GIVEN the user is not in multiselect mode WHEN a tab group is clicked THEN navigate to the expanded tab group destination`() {
        val initialState = TabsTrayState(mode = Mode.Normal)
        val expectedTabGroup = createTabGroup()
        val expectedBackStack = initialState.backStack + ExpandedTabGroup(group = expectedTabGroup)
        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.TabGroupClicked(group = expectedTabGroup),
        )

        assertEquals(expectedBackStack, resultState.backStack)
    }

    @Test
    fun `GIVEN the user is in multiselect mode WHEN a tab group is clicked THEN do not navigate away`() {
        val initialState = TabsTrayState(mode = Mode.Select(selectedTabs = setOf()))
        val expectedTabGroup = createTabGroup()
        val expectedBackStack = initialState.backStack
        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.TabGroupClicked(group = expectedTabGroup),
        )

        assertEquals(expectedBackStack, resultState.backStack)
    }

    @Test
    fun `WHEN delete is confirmed from expanded tab group THEN pop the confirmation dialog and expanded tab group`() {
        val group = createTabGroup()
        val initialState = TabsTrayState(
            backStack = listOf(
                TabsTrayState().backStack.first(),
                ExpandedTabGroup(group = group),
                DeleteTabGroupConfirmationDialog(group = group),
            ),
        )

        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.DeleteConfirmed(group = group),
        )

        assertEquals(TabsTrayState().backStack, resultState.backStack)
    }

    @Test
    fun `WHEN delete is confirmed from root tab manager THEN pop the confirmation dialog`() {
        val group = createTabGroup()
        val initialState = TabsTrayState(
            backStack = listOf(
                TabsTrayState().backStack.first(),
                DeleteTabGroupConfirmationDialog(group = group),
            ),
        )

        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.DeleteConfirmed(group = group),
        )

        assertEquals(TabsTrayState().backStack, resultState.backStack)
    }

    @Test
    fun `WHEN add to new tab group is clicked THEN navigate to create tab group destination`() {
        val initialState = TabsTrayState()

        val expectedFormState = initialState.initializeTabGroupForm()
        val expectedBackStack = initialState.backStack + EditTabGroup

        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.AddToNewTabGroup,
        )

        assertEquals(expectedFormState, resultState.tabGroupState.formState)
        assertEquals(expectedBackStack, resultState.backStack)
    }

    @Test
    fun `WHEN ThemeChanged is called THEN theme is updated`() {
        val initialFormState = TabGroupFormState(tabGroupId = "123", name = "123", theme = TabGroupTheme.Blue)

        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    formState = initialFormState,
                ),
            ),
            action = TabGroupAction.ThemeChanged(theme = TabGroupTheme.Pink),
        )

        assertEquals(resultState.tabGroupState.formState!!.theme, TabGroupTheme.Pink)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `WHEN ThemeChanged is called with null form THEN exception is thrown`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(tabGroupState = TabsTrayState.TabGroupState(formState = null)),
            action = TabGroupAction.ThemeChanged(theme = TabGroupTheme.Pink),
        )

        assertEquals(resultState.tabGroupState.formState!!.theme, TabGroupTheme.Pink)
    }

    @Test
    fun `WHEN no groups exist the default next number is 1`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    groups = emptyList(),
                ),
            ),
            action = TabGroupAction.AddToNewTabGroup,
        )

        assertEquals(1, resultState.tabGroupState.formState!!.nextTabGroupNumber)
    }

    @Test
    fun `WHEN 1 group exists the default next number is 2`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    groups = listOf(
                        TabsTrayItem.TabGroup(
                            title = "Group 1",
                            theme = TabGroupTheme.Yellow,
                            tabs = mutableListOf(),
                        ),
                    ),
                ),
            ),
            action = TabGroupAction.AddToNewTabGroup,
        )

        assertEquals(2, resultState.tabGroupState.formState!!.nextTabGroupNumber)
    }

    @Test
    fun `WHEN 99 groups exist the default next number is 100`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(
                tabGroupState = TabsTrayState.TabGroupState(
                    groups = List(99) {
                        TabsTrayItem.TabGroup(
                            title = "Group $it",
                            theme = TabGroupTheme.Yellow,
                            tabs = mutableListOf(),
                        )
                    },
                ),
            ),
            action = TabGroupAction.AddToNewTabGroup,
        )

        assertEquals(100, resultState.tabGroupState.formState!!.nextTabGroupNumber)
    }

    @Test
    fun `WHEN tabs are added to a group via multiselection THEN multiselection is exited and navigate back to the root`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(
                mode = Mode.Select(),
                backStack = TabsTrayState().backStack + AddToTabGroup,
            ),
            action = TabGroupAction.TabsAddedToGroup(groupId = "12345"),
        )
        val expectedState = TabsTrayState(
            mode = Mode.Normal,
            backStack = TabsTrayState().backStack,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN the user adds a single tab to a group THEN the state is unchanged`() {
        val resultState = TabGroupActionReducer.reduce(
            state = TabsTrayState(),
            action = TabGroupAction.TabAddedToGroup(tabId = "54321", groupId = "12345"),
        )
        assertEquals(TabsTrayState(), resultState)
    }

    @Test
    fun `GIVEN the user has at least 1 tab group WHEN the user clicks to add tabs to a group THEN navigate to the ADD TO GROUP flow`() {
        val initialState = TabsTrayState(
            tabGroupState = TabsTrayState.TabGroupState(
                groups = listOf(createTabGroup()),
            ),
        )
        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.AddToTabGroup,
        )
        val expectedState = initialState.copy(
            backStack = initialState.backStack + AddToTabGroup,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `GIVEN the user has no tab groups WHEN the user clicks to add tabs to a group THEN navigate to the EDIT_CREATE GROUP flow`() {
        val initialState = TabsTrayState()
        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.AddToTabGroup,
        )
        val expectedState = initialState.copy(
            tabGroupState = initialState.tabGroupState.copy(
                formState = initialState.initializeTabGroupForm(),
            ),
            backStack = initialState.backStack + EditTabGroup,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN the user clicks to edit an existing tab group THEN navigate to the edit flow`() {
        val group = createTabGroup()
        val initialState = TabsTrayState()
        val resultState = TabGroupActionReducer.reduce(
            state = initialState,
            action = TabGroupAction.EditTabGroupClicked(group = group),
        )
        val expectedState = initialState.copy(
            tabGroupState = initialState.tabGroupState.copy(
                formState = group.initializeTabGroupForm(),
            ),
            backStack = initialState.backStack + EditTabGroup,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN a user clicks on an unselected tab group during multiselection THEN the group and its tabs are added to the selection state`() {
        val tabs = List(size = 20) { createTab(url = "") }
        val tabGroup = createTabGroup(
            tabs = MutableList(size = 20) { createTab(url = "") },
        )
        val initialState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(items = tabs + tabGroup),
            mode = Mode.Select(
                selectedTabs = emptySet(),
                selectedTabGroups = emptySet(),
            ),
            tabGroupState = TabsTrayState.TabGroupState(groups = listOf(tabGroup)),
        )
        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabGroupAction.TabGroupClicked(group = tabGroup),
        )
        val expectedState = initialState.copy(
            mode = Mode.Select(
                selectedTabs = tabGroup.tabs.toSet(),
                selectedTabGroups = setOf(tabGroup),
            ),
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `WHEN a user clicks on a selected tab group during multiselection THEN the group and its tabs are removed from the selection state`() {
        val tabs = List(size = 20) { createTab(url = "") }
        val tabGroup = createTabGroup(
            tabs = MutableList(size = 20) { createTab(url = "") },
        )
        val initialState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(items = tabs + tabGroup),
            mode = Mode.Select(
                selectedTabs = tabGroup.tabs.toSet(),
                selectedTabGroups = setOf(tabGroup),
            ),
            tabGroupState = TabsTrayState.TabGroupState(groups = listOf(tabGroup)),
        )
        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabGroupAction.TabGroupClicked(group = tabGroup),
        )
        val expectedState = initialState.copy(
            mode = Mode.Normal,
        )

        assertEquals(expectedState, resultState)
    }

    @Test
    fun `GIVEN there is a tab and a tab group selected WHEN a user taps clicks on the selected tab group during multiselection THEN the group and its tabs are removed from the selection state`() {
        val tabs = List(size = 20) { createTab(url = "") }
        val tabGroup = createTabGroup(
            tabs = MutableList(size = 20) { createTab(url = "") },
        )
        val initialState = TabsTrayState(
            normalTabsState = TabsTrayState.NormalTabsState(items = tabs + tabGroup),
            mode = Mode.Select(
                selectedTabs = tabGroup.tabs.toSet() + tabs[0],
                selectedTabGroups = setOf(tabGroup),
            ),
            tabGroupState = TabsTrayState.TabGroupState(groups = listOf(tabGroup)),
        )
        val resultState = TabsTrayReducer.reduce(
            state = initialState,
            action = TabGroupAction.TabGroupClicked(group = tabGroup),
        )
        val expectedState = initialState.copy(
            mode = Mode.Select(
                selectedTabs = setOf(tabs[0]),
                selectedTabGroups = emptySet(),
            ),
        )

        assertEquals(expectedState, resultState)
    }
}
