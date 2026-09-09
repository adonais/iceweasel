/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import androidx.compose.runtime.Composable
import mozilla.components.feature.top.sites.TopSite
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.utils.Settings

/**
 * State of the top sites section on the homepage.
 *
 * @property topSites List of [TopSite] to display.
 * @property colors The color set defined by [TopSiteColors] used to style a top site.
 * @property isAddShortcutEnabled Whether the "Add shortcut" tile is enabled. When expanded it is shown after the last
 *   shortcut, matching the shortcuts library. When collapsed it is only shown if it fits within [TOP_SITES_TO_SHOW].
 * @property showExpandToggle Whether to show the control that expands and collapses the section.
 * @property showShortcutsLibraryButton Whether to show the header button that opens the shortcuts library. Hidden while
 *   the expand/collapse experiment is active, as that control supersedes it.
 */
internal data class TopSiteState(
    val topSites: List<TopSite>,
    val colors: TopSiteColors,
    val isAddShortcutEnabled: Boolean = false,
    val showExpandToggle: Boolean = false,
    val showShortcutsLibraryButton: Boolean = true,
) {

    companion object {

        /**
         * Builds a new [TopSiteState] from the current [AppState] and [Settings], or null when the top sites section
         * should be hidden.
         *
         * @param appState State to build the [TopSiteState] from.
         * @param settings [Settings] corresponding to how the top sites should be displayed.
         */
        @Composable
        internal fun build(
            appState: AppState,
            settings: Settings,
        ): TopSiteState? {
            return appState.topSites
                .takeIf { settings.showTopSitesFeature && it.isNotEmpty() }
                ?.let { topSites ->
                    val isAddShortcutEnabled = settings.enableAddShortcutsImprovement

                    // Expanding is worthwhile when it reveals either more shortcuts, or the
                    // "Add shortcut" tile that does not fit in the collapsed grid.
                    val hasHiddenShortcuts = topSites.size > TOP_SITES_TO_SHOW
                    val hasHiddenAddShortcut = isAddShortcutEnabled && topSites.size >= TOP_SITES_TO_SHOW

                    TopSiteState(
                        topSites = topSites,
                        colors = TopSiteColors.colors(wallpaperState = appState.wallpaperState),
                        isAddShortcutEnabled = isAddShortcutEnabled,
                        showExpandToggle = settings.showMoreShortcuts && (hasHiddenShortcuts || hasHiddenAddShortcut),
                        showShortcutsLibraryButton = !settings.showMoreShortcuts,
                    )
                }
        }
    }
}
