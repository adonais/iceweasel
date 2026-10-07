/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.strip.redux

import androidx.compose.runtime.Immutable
import mozilla.components.lib.state.State

/**
 * The state held by the [TabGroupsStripStore].
 *
 * @property tabs The tabs of the active tab's group, shown in the strip.
 */
@Immutable
data class TabGroupsStripState(val tabs: List<Tab> = emptyList()) : State {
    /**
     * A tab shown in the strip.
     *
     * @property id The tab's ID.
     * @property url The tab's URL.
     * @property title The tab's display title.
     * @property isFocused Whether this is the active tab.
     */
    @Immutable
    data class Tab(
        val id: String,
        val url: String,
        val title: String,
        val isFocused: Boolean,
    )
}
