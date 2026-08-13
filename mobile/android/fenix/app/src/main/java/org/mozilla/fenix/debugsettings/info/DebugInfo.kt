/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info

import android.content.Context
import org.mozilla.fenix.R

/**
 * A debug info item. This can represent a setting or application configuration.
 *
 * @property label The label of the debug info item.
 * @property value The current value of the debug info item.
 */
data class DebugInfoItem(
    val label: String,
    val value: DebugInfoValue,
)

/**
 * The display content of a [DebugInfoItem].
 */
sealed interface DebugInfoValue {
    /**
     * The text value of the debug info item.
     *
     * @property text The text to be displayed for the debug info item.
     */
    data class Text(val text: String) : DebugInfoValue

    /**
     * The enabled state of the debug info item.
     *
     * @property enabled Whether the debug info item is enabled.
     */
    data class State(val enabled: Boolean) : DebugInfoValue
}

/**
 * Returns the display text for the current [DebugInfoValue].
 */
fun DebugInfoValue.displayText(context: Context): String = when (this) {
    is DebugInfoValue.Text -> text
    is DebugInfoValue.State -> context.getString(
        if (enabled) R.string.debug_info_enabled else R.string.debug_info_disabled,
    )
}

/**
 * A group of [DebugInfoItem]s categorized by [title].
 *
 * @property title The section title of the group.
 * @property items A list of [DebugInfoItem]s to display in the section.
 */
data class DebugInfoSection(
    val title: String,
    val items: List<DebugInfoItem>,
)
