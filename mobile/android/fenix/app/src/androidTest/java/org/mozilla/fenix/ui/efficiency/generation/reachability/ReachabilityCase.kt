/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.reachability

import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageContext
import org.mozilla.fenix.ui.efficiency.navigation.LaunchConfig

data class ReachabilityCase(
    val label: String,
    val testRailId: String,
    val page: PageContext.() -> BasePage,
    val state: String = "",
    val launch: LaunchConfig = LaunchConfig(),
    /**
     * A gate that must hold before navigation starts, polled in [BaseReachabilityShardTest.runNavigationCase]. Defaults
     * to a no-op so existing cases are unaffected. Use it when a page's entry point only appears once some async app
     * state has resolved, and that state is latched when the screen is created (so waiting on the click cannot recover
     * it). Example: the Settings "Translations" row, gated on the engine-support check that resolves asynchronously
     * after launch.
     */
    val precondition: () -> Boolean = { true },
) {
    override fun toString(): String = "$label ($testRailId)${if (state.isNotBlank()) " — $state" else ""}"
}
