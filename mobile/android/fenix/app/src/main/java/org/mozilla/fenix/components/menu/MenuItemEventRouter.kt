/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.support.base.log.logger.Logger

/**
 * Router ensuring an indicated [MenuEvent] is handled by the appropriate [MenuItemProvider].
 *
 * @param registry [MenuItemsRegistry] with the providers of all items the menu may show.
 * @param host [MenuHost] delegate for inte.
 */
class MenuItemEventRouter(
    private val registry: MenuItemsRegistry,
    private val host: MenuHost,
) {
    private val logger = Logger("MenuItemEventRouter")

    /**
     * Pass in the given [event] to the appropriate [MenuItemEventRouter] for handling.
     *
     * @return Whether a provider handled the [event].
     */
    fun route(event: MenuEvent): Boolean {
        val providers = registry.providers.values.filter { it.handles(event) }
        val provider = providers.firstOrNull() ?: return false
        if (providers.size > 1) {
            val names = providers.joinToString { it.javaClass.simpleName }
            logger.warn("$event is handled by $names, letting only the first one react to it")
        }

        provider.onEvent(event, host)

        return true
    }
}
