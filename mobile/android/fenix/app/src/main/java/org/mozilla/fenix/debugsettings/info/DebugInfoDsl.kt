/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info

/**
 * DSL marker for debug info builder scopes.
 */
@DslMarker
annotation class DebugInfoDsl

/**
 * Builder scope for the items within a [DebugInfoSection].
 */
@DebugInfoDsl
class DebugInfoSectionScope {
    private val items = mutableListOf<DebugInfoItem>()
    private val lock = Any()

    /**
     * Adds a label to value text item to display the text value of the debug info item.
     *
     * @param label The label of the debug info item.
     * @param value The display text value of the debug info item.
     */
    fun textItem(label: String, value: String) = synchronized(lock) {
        items += DebugInfoItem(label = label, value = DebugInfoValue.Text(value))
    }

    /**
     * Adds a status item to display the enabled state of the debug info item.
     *
     * @param label The label of the debug info item.
     * @param enabled Whether the debug info item is enabled.
     */
    fun statusItem(label: String, enabled: Boolean) = synchronized(lock) {
        items += DebugInfoItem(label = label, value = DebugInfoValue.State(enabled))
    }

    internal fun build(): List<DebugInfoItem> = synchronized(lock) { items.toList() }
}

/**
 * DSL builder function to build a [DebugInfoSection].
 *
 * @param title The title of the group.
 * @param fetchItems Lambda used to return the section's [DebugInfoItem]s.
 */
suspend fun buildSection(
    title: String,
    fetchItems: suspend DebugInfoSectionScope.() -> Unit,
): DebugInfoSection {
    val scope = DebugInfoSectionScope()
    scope.fetchItems()
    return DebugInfoSection(title = title, items = scope.build())
}
