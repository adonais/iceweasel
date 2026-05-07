/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.sports

import org.mozilla.fenix.home.sports.MatchCard
import org.mozilla.fenix.home.sports.hasWorldCupStarted

/**
 * State of the sports widget on the homepage.
 *
 * @property countriesSelected Set of ISO codes of the selected countries, empty if none.
 * @property hasSkippedFollowTeam Whether the user skipped the "Follow your team" card.
 * @property isVisible Whether the sports widget is visible on the homepage.
 * @property isFeatureEnabled Whether the Homepage Sports Widget feature is enabled.
 * @property isCountdownWidgetVisible Whether the Homepage Countdown Widget feature is enabled.
 * @property matchCardState The [MatchCard] to render on the homepage, or null when no match
 * data is available.
 * @property isDebugToolVisible Whether the debug tool for adjusting [SportsWidgetState]
 * is currently displayed on the homepage.
 * @property hasWorldCupStartedOverride Debug-only override for [hasWorldCupStarted].
 */
data class SportsWidgetState(
    val countriesSelected: Set<String> = emptySet(),
    val hasSkippedFollowTeam: Boolean = false,
    val isVisible: Boolean = true,
    val isFeatureEnabled: Boolean = false,
    val isCountdownWidgetVisible: Boolean = true,
    val matchCardState: MatchCard? = null,
    val isDebugToolVisible: Boolean = false,
    val hasWorldCupStartedOverride: Boolean? = null,
) {
    /**
     * Whether the sports widget should be rendered on the homepage: true only when the feature
     * is enabled and the user has not dismissed the widget.
     */
    val isShown: Boolean
        get() = isFeatureEnabled && isVisible

    val hasWorldCupStarted: Boolean
        get() = hasWorldCupStartedOverride ?: hasWorldCupStarted()

    val isCountdownShown: Boolean
        get() = !hasWorldCupStarted && isCountdownWidgetVisible

    val isFollowTeamsCardShown: Boolean
        get() = hasWorldCupStarted && !hasSkippedFollowTeam && countriesSelected.isEmpty()
}
