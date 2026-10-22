/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.WebExtensionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.lib.state.Store
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.addons.WebExtensionMenuAction
import org.mozilla.fenix.addons.findWebExtensionMenuAction
import org.mozilla.fenix.addons.webExtensionMenuActions
import org.mozilla.fenix.components.menu.compose.WebExtensionMenuItem
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.components.menu.store.MenuState
import org.mozilla.fenix.components.menu.store.MenuStore
import org.mozilla.fenix.components.menu.store.WebExtensionMenuItem

/**
 * Helper for observing Extension state from both [BrowserState.extensions] and [TabSessionState.extensionState].
 *
 * @param browserStore Used to listen for changes to [WebExtensionState].
 * @param customTabId The ID of the custom tab to observe, or null to observe the selected tab.
 * @param menuStore The [Store] for holding the [MenuState] and applying [MenuAction]s.
 * @param iconSize for [WebExtensionMenuItem].
 * @param onDismiss Callback invoked to dismiss the menu dialog.
 * @param mainDispatcher The [CoroutineDispatcher] on which the state observation and updates will occur. Defaults to
 *   [Dispatchers.Main].
 */
class WebExtensionsMenuBinding(
    private val browserStore: BrowserStore,
    private val customTabId: String?,
    private val menuStore: MenuStore,
    private val iconSize: Int,
    private val onDismiss: () -> Unit,
    mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) : AbstractBinding<BrowserState>(browserStore, mainDispatcher) {

    override suspend fun onState(flow: Flow<BrowserState>) {
        flow.webExtensionMenuActions(customTabId = customTabId, iconSize = iconSize).collect { actions ->
            menuStore.dispatch(
                MenuAction.UpdateWebExtensionBrowserMenuItems(actions.map { it.toWebExtensionMenuItem() })
            )
        }
    }

    private fun WebExtensionMenuAction.toWebExtensionMenuItem() =
        WebExtensionMenuItem(
            id = extensionId,
            label = label,
            enabled = enabled,
            icon = icon,
            badgeText = badgeText,
            badgeTextColor = badgeTextColor,
            badgeBackgroundColor = badgeBackgroundColor,
            onClick = {
                onDismiss()

                // What the extension offers may have changed since this item was built, so it is resolved again.
                browserStore.state
                    .findWebExtensionMenuAction(
                        extensionId = extensionId,
                        isPageAction = isPageAction,
                        customTabId = customTabId,
                    )
                    ?.onClick()
            },
        )
}
