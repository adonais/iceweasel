/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.action

import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.redux.action.TabsTrayAction.TabsStorageAction

/**
 *[TabsTrayAction]'s that represent user interactions for the Tab Group feature.
 */
sealed interface TabGroupAction : TabsTrayAction {
    /**
     * Fired when the user clicks on adding tab(s) to a tab group.
     */
    data object AddToTabGroup : TabGroupAction

    /**
     * Fired when the user clicks on adding tab(s) to a new tab group.
     */
    data object AddToNewTabGroup : TabGroupAction

    /**
     * Fired when the user changes the tab group name.
     *
     * @property name The name of the tab group the user has typed in.
     */
    data class NameChanged(val name: String) : TabGroupAction

    /**
     * Confirms the save of a tab group.
     */
    data object SaveClicked : TabGroupAction, TabsStorageAction

    /**
     * Invoked when the user dismisses the tab group form.
     */
    data object FormDismissed : TabGroupAction

    /**
     * Fired when the user clicks on a Tab Group.
     *
     * @property group The clicked [TabsTrayItem.TabGroup].
     */
    data class TabGroupClicked(val group: TabsTrayItem.TabGroup) : TabGroupAction

    /**
     * Fired when the user clicks delete on a Tab Group.
     *
     * @property group The clicked [TabsTrayItem.TabGroup].
     */
    data class DeleteClicked(val group: TabsTrayItem.TabGroup) : TabGroupAction

    /**
     * Fired when the user confirms to delete a Tab Group.
     *
     * @property group The clicked [TabsTrayItem.TabGroup].
     */
    data class DeleteConfirmed(val group: TabsTrayItem.TabGroup) : TabGroupAction, TabsStorageAction

    /**
     * Invoked when the user changes the tab group theme.
     *
     * @property theme The theme of the tab group the user has selected.
     */
    data class ThemeChanged(val theme: TabGroupTheme) : TabGroupAction

    /**
     * Fired when the user performs an action to add the current collection of
     * multiselected items to an existing Tab Group.
     *
     * @property groupId The ID of the group the tabs are being added into.
     */
    data class TabsAddedToGroup(val groupId: String) : TabGroupAction, TabsStorageAction

    /**
     * Fired when the user performs an action to add a single item to an existing Tab Group, such as a drag and drop.
     *
     * @property tabId The ID of the tab.
     * @property groupId The ID of the group the tab is being added into.
     */
    data class TabAddedToGroup(val tabId: String, val groupId: String) : TabGroupAction, TabsStorageAction

    /**
     * Invoked when the user clicks to edit a tab group.
     *
     * @property group The [TabsTrayItem.TabGroup] to be edited.
     */
    data class EditTabGroupClicked(val group: TabsTrayItem.TabGroup) : TabGroupAction
}
