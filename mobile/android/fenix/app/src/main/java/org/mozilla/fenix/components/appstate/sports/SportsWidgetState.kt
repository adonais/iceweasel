/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.sports

/**
 * State of the sports widget on the homepage.
 *
 * @property countriesSelected Set of ISO codes of the selected countries, empty if none.
 * @property hasWorldCupStarted Whether the World Cup has started.
 * @property hasSkippedFollowTeam Whether the user skipped the "Follow your team" card.
 */
data class SportsWidgetState(
    val countriesSelected: Set<String> = emptySet(),
    val hasWorldCupStarted: Boolean = false,
    val hasSkippedFollowTeam: Boolean = false,
)
