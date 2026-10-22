/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.addons

import android.graphics.Bitmap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.selector.findCustomTabOrSelectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.state.WebExtensionState
import mozilla.components.concept.engine.webextension.Action

/**
 * The browser or page action of a web extension, with all details needed to show it in a menu already resolved.
 *
 * @property extensionId The id of the extension this action belongs to.
 * @property isPageAction Whether this is a page action, as opposed to a browser action.
 * @property label The user facing name of this action.
 * @property icon The icon the extension asks this action to be shown with, if it has one.
 * @property enabled Whether the extension allows this action to be interacted with.
 * @property badgeText The text of the badge the extension asks to be shown, if any.
 * @property badgeTextColor The color the extension asks the badge text to be shown in, if any.
 * @property badgeBackgroundColor The color the extension asks the badge to be shown in, if any.
 */
data class WebExtensionMenuAction(
    val extensionId: String,
    val isPageAction: Boolean,
    val label: String,
    val icon: Bitmap?,
    val enabled: Boolean?,
    val badgeText: String?,
    val badgeTextColor: Int?,
    val badgeBackgroundColor: Int?,
)

/**
 * The actions of all extensions that can be shown in a menu opened for a specific tab, updated whenever the installed
 * extensions or the state they have in that tab changes.
 *
 * @param customTabId The id of the custom tab to show the actions for, or `null` to show them for the selected tab.
 * @param iconSize The size in pixels in which to load the icon of each action.
 */
fun Flow<BrowserState>.webExtensionMenuActions(
    customTabId: String?,
    iconSize: Int,
): Flow<List<WebExtensionMenuAction>> = webExtensionMenuActions(iconSize) { findCustomTabOrSelectedTab(customTabId) }

/**
 * The actions of all extensions that can be shown in a menu opened for a specific tab, updated whenever the installed
 * extensions or the state they have in that tab changes.
 *
 * @param iconSize The size in pixels in which to load the icon of each action.
 * @param findSession Finds the tab to show the actions for. No actions are offered while there is no such tab.
 */
fun Flow<BrowserState>.webExtensionMenuActions(
    iconSize: Int,
    findSession: BrowserState.() -> SessionState?,
): Flow<List<WebExtensionMenuAction>> {
    // What extensions are installed is a browser wide detail, what they show is specific to each tab.
    val extensions = distinctUntilChangedBy { it.extensions }
    val tab = map { it.findSession() }.distinctUntilChangedBy { it?.id to it?.extensionState }

    return tab.combine(extensions) { tabState, browserState -> tabState to browserState }
        .map { (tabState, browserState) ->
            tabState?.let { browserState.webExtensionMenuActions(it, iconSize) } ?: emptyList()
        }
}

/**
 * The action the user clicked in a menu, resolved together with the overrides the extension set for the current tab.
 *
 * @param extensionId The id of the extension owning the action.
 * @param isPageAction Whether the clicked action was a page action, as opposed to a browser action.
 * @param customTabId The id of the custom tab the menu was opened for, or `null` if it was the selected tab.
 */
fun BrowserState.findWebExtensionMenuAction(
    extensionId: String,
    isPageAction: Boolean,
    customTabId: String? = null,
): Action? = findWebExtensionMenuAction(extensionId, isPageAction) { findCustomTabOrSelectedTab(customTabId) }

/**
 * The action the user clicked in a menu, resolved together with the overrides the extension set for a tab.
 *
 * @param extensionId The id of the extension owning the action.
 * @param isPageAction Whether the clicked action was a page action, as opposed to a browser action.
 * @param findSession Finds the tab the menu was opened for. Without such a tab there is no action to click.
 */
fun BrowserState.findWebExtensionMenuAction(
    extensionId: String,
    isPageAction: Boolean,
    findSession: BrowserState.() -> SessionState?,
): Action? {
    val tab = findSession() ?: return null

    return extensions[extensionId]?.resolveAction(tab, isPageAction)
}

/**
 * The actions of all extensions that can be shown in a menu opened for a specific tab, without their icons.
 *
 * Unlike the icons, which need to be loaded, everything else about the actions is known right away.
 *
 * @param customTabId The id of the custom tab to show the actions for, or `null` to show them for the selected tab.
 */
fun BrowserState.webExtensionMenuActionsWithoutIcons(customTabId: String?): List<WebExtensionMenuAction> =
    webExtensionMenuActionsWithoutIcons(findSession = { findCustomTabOrSelectedTab(customTabId) })

/**
 * The actions of all extensions that can be shown in a menu opened for a specific tab, without their icons.
 *
 * Unlike the icons, which need to be loaded, everything else about the actions is known right away.
 *
 * @param findSession Finds the tab to show the actions for. Nothing is shown while there is no such tab.
 */
fun BrowserState.webExtensionMenuActionsWithoutIcons(
    findSession: BrowserState.() -> SessionState?
): List<WebExtensionMenuAction> {
    val tab = findSession() ?: return emptyList()

    return extensionActions(tab).map { (_, menuAction) -> menuAction }
}

private suspend fun BrowserState.webExtensionMenuActions(
    tab: SessionState,
    iconSize: Int,
): List<WebExtensionMenuAction> =
    extensionActions(tab).map { (action, menuAction) -> menuAction.copy(icon = action.loadIcon?.invoke(iconSize)) }

/** Each action that can be shown for [tab], together with what is needed to show it in a menu, except its icon. */
private fun BrowserState.extensionActions(tab: SessionState): List<Pair<Action, WebExtensionMenuAction>> =
    extensions.values
        .filterNot { !it.allowedInPrivateBrowsing && tab.content.private }
        .sortedBy { it.name }
        .flatMap { extension ->
            listOfNotNull(
                extension.toMenuAction(tab, isPageAction = false),
                extension.toMenuAction(tab, isPageAction = true),
            )
        }

private fun WebExtensionState.toMenuAction(
    tab: SessionState,
    isPageAction: Boolean,
): Pair<Action, WebExtensionMenuAction>? {
    val action = resolveAction(tab, isPageAction) ?: return null

    // Browser actions are shown for every page, page actions only for the ones the extension enables them for.
    if (isPageAction && action.enabled != true) return null

    val label = action.title?.takeUnless { it.isBlank() } ?: name ?: return null

    return action to
        WebExtensionMenuAction(
            extensionId = id,
            isPageAction = isPageAction,
            label = label,
            icon = null,
            enabled = action.enabled,
            badgeText = action.badgeText,
            badgeTextColor = action.badgeTextColor,
            badgeBackgroundColor = action.badgeBackgroundColor,
        )
}

/** The action of this extension as it applies to [tab], which can override any of the browser wide details. */
private fun WebExtensionState.resolveAction(
    tab: SessionState?,
    isPageAction: Boolean,
): Action? {
    if (!enabled) return null

    val action = if (isPageAction) pageAction else browserAction
    val override = tab?.extensionState?.get(id)?.let { if (isPageAction) it.pageAction else it.browserAction }

    return action?.copyWithOverride(override)
}
