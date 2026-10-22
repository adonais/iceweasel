/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.compose.menu.data.ExpandableMenuItem
import mozilla.components.compose.menu.data.MenuItem as ShownMenuItem
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.data.StandardMenuItem
import org.mozilla.fenix.components.menu.MenuPresentationMode.Grid
import org.mozilla.fenix.components.menu.MenuPresentationMode.Row

/**
 * Assembles a menu from the items each feature provides.
 *
 * This only knows which items may be shown, in what order and grouped how. What any one of them looks like is left to
 * its [MenuItemProvider].
 *
 * @param registry [MenuItemsRegistry] with the sections of the menu and the provider of each item in them.
 */
class MenuBuilder(private val registry: MenuItemsRegistry) {
    private val configuration = registry.configuration

    private val orderedItems = registry.providers.keys.toList()

    /** The menu to show, re-emitted whenever any of the items in it changes. */
    val menuStructure: Flow<List<MenuItemsGroup>> =
        orderedItems.itemsFromProviders().map { items -> configuration.toGroups(items) }.distinctUntilChanged()

    /**
     * What the feature owning each of these items currently offers for it, re-emitted whenever any one of them changes.
     * An item that should not be shown for now is offered as `null`, meaning the provider decided that its item should
     * not be shown rather than that it has not decided yet.
     */
    private fun List<FenixMenuItem>.itemsFromProviders(): Flow<Map<FenixMenuItem, ShownMenuItem?>> =
        combine(map { registry[it].itemFlow }) { provided -> zip(provided).toMap() }

    /**
     * A [MenuItemsGroup] for each of these sections, laid out the way the section asks for and holding only the items
     * that are currently shown. Sections left with nothing to show are dropped.
     */
    private fun List<MenuSectionConfiguration>.toGroups(items: Map<FenixMenuItem, ShownMenuItem?>) = map { section ->
        section.toGroup(shownItems = section.items.mapNotNull { it.getMenuItemToShow(items) })
    }
        .filterNot { it.items.isEmpty() }

    /**
     * Get the menu item configuration to show for this or `null` if it isn't available
     *
     * @param items A map of all the menu items wanted to be shown in the menu to the actual menu items configuration
     *   available.
     */
    private fun FenixMenuItem.getMenuItemToShow(items: Map<FenixMenuItem, ShownMenuItem?>): ShownMenuItem? {
        if (this !is FenixExpandableMenuItem) return items[this]

        val header = items[this] as? ExpandableMenuItem ?: return null
        val children = subMenuItems.mapNotNull { items[it] as? StandardMenuItem }
        if (children.isEmpty()) return null

        val provider = registry[this] as? ExpandableMenuItemProvider
        return provider?.updateWithSubMenuItems(header, children)
    }

    private fun MenuSectionConfiguration.toGroup(shownItems: List<ShownMenuItem>) =
        when (presentationMode) {
            Row -> MenuItemsGroup.Row(id = id, items = shownItems, isSticky = isSticky)
            Grid -> MenuItemsGroup.Grid(id = id, items = shownItems, isSticky = isSticky)
        }
}
