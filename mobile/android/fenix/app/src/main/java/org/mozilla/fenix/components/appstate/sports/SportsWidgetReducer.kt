/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.sports

import org.mozilla.fenix.components.appstate.AppAction.SportsWidgetAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * [AppState] reducer for [SportsWidgetAction].
 */
internal object SportsWidgetReducer {
    fun reduce(state: AppState, action: SportsWidgetAction): AppState = when (action) {
        is SportsWidgetAction.CountriesSelected -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                countriesSelected = action.countryCodes,
            ),
        )

        SportsWidgetAction.FollowTeamSkipped -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                hasSkippedFollowTeam = true,
            ),
        )

        is SportsWidgetAction.VisibilityChanged -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                isVisible = action.isVisible,
            ),
        )

        is SportsWidgetAction.CountdownVisibilityChanged -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                isCountdownWidgetVisible = action.isCountdownVisible,
            ),
        )

        is SportsWidgetAction.MatchCardStateUpdated -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                matchCardState = action.matchCardState,
                errorState = null,
            ),
        )

        is SportsWidgetAction.DebugToolVisibilityChanged -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                isDebugToolVisible = action.visible,
            ),
        )

        is SportsWidgetAction.WorldCupStartedOverrideUpdated -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                hasWorldCupStartedOverride = action.hasWorldCupStartedOverride,
            ),
        )

        is SportsWidgetAction.SkipFollowTeamUpdated -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                hasSkippedFollowTeam = action.hasSkippedFollowTeam,
            ),
        )

        SportsWidgetAction.FetchMatches -> state

        is SportsWidgetAction.FetchFailed -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                errorState = action.error,
            ),
        )

        is SportsWidgetAction.OneWeekToWorldCupOverrideUpdated -> state.copy(
            sportsWidgetState = state.sportsWidgetState.copy(
                isOneWeekToWorldCupOverride = action.isOneWeekToWorldCupOverride,
            ),
        )
    }
}
