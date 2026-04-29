/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.sports

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.AppStoreReducer

class SportsWidgetReducerTest {

    @Test
    fun `GIVEN no countries selected WHEN CountriesSelected is dispatched with countries THEN countriesSelected is updated`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.CountriesSelected(countryCodes = setOf("US", "JP")),
        )

        assertEquals(
            setOf("US", "JP"),
            finalState.sportsWidgetState.countriesSelected,
        )
    }

    @Test
    fun `GIVEN countries already selected WHEN CountriesSelected is dispatched THEN countriesSelected is replaced`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(countriesSelected = setOf("US")),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.CountriesSelected(countryCodes = setOf("JP", "BR")),
        )

        assertEquals(
            setOf("JP", "BR"),
            finalState.sportsWidgetState.countriesSelected,
        )
    }

    @Test
    fun `GIVEN countries selected WHEN CountriesSelected is dispatched with empty set THEN countriesSelected is cleared`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(countriesSelected = setOf("US")),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.CountriesSelected(countryCodes = emptySet()),
        )

        assertEquals(
            emptySet<String>(),
            finalState.sportsWidgetState.countriesSelected,
        )
    }

    @Test
    fun `GIVEN default state WHEN CountriesSelected is dispatched THEN countriesSelected is updated`() {
        val initialState = AppState()

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.CountriesSelected(countryCodes = setOf("DE")),
        )

        assertEquals(
            setOf("DE"),
            finalState.sportsWidgetState.countriesSelected,
        )
    }

    @Test
    fun `GIVEN hasSkippedFollowTeam is false WHEN SkippedFollowTeam is dispatched THEN hasSkippedFollowTeam is true`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(hasSkippedFollowTeam = false),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.FollowTeamSkipped,
        )

       assertTrue(finalState.sportsWidgetState.hasSkippedFollowTeam)
    }

    @Test
    fun `GIVEN hasSkippedFollowTeam is true WHEN SkippedFollowTeam is dispatched THEN hasSkippedFollowTeam remains true`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(hasSkippedFollowTeam = true),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.FollowTeamSkipped,
        )

       assertTrue(finalState.sportsWidgetState.hasSkippedFollowTeam)
    }

    @Test
    fun `GIVEN countries already selected WHEN SkippedFollowTeam is dispatched THEN countriesSelected is preserved`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(countriesSelected = setOf("US")),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.FollowTeamSkipped,
        )

        assertEquals(setOf("US"), finalState.sportsWidgetState.countriesSelected)
        assertEquals(true, finalState.sportsWidgetState.hasSkippedFollowTeam)
    }

    @Test
    fun `GIVEN isVisible is true WHEN VisibilityChanged is dispatched with false THEN isVisible is false`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(isVisible = true),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false),
        )

        assertFalse(finalState.sportsWidgetState.isVisible)
    }

    @Test
    fun `GIVEN isVisible is false WHEN VisibilityChanged is dispatched with true THEN isVisible is true`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(isVisible = false),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.VisibilityChanged(isVisible = true),
        )

        assertTrue(finalState.sportsWidgetState.isVisible)
    }

    @Test
    fun `GIVEN isVisible is false WHEN VisibilityChanged is dispatched with false THEN isVisible remains false`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(isVisible = false),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false),
        )

        assertFalse(finalState.sportsWidgetState.isVisible)
    }

    @Test
    fun `GIVEN countries and skip state WHEN VisibilityChanged is dispatched THEN other fields are preserved`() {
        val initialState = AppState(
            sportsWidgetState = SportsWidgetState(
                countriesSelected = setOf("US"),
                hasSkippedFollowTeam = true,
                isVisible = true,
            ),
        )

        val finalState = AppStoreReducer.reduce(
            initialState,
            AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false),
        )

        assertEquals(setOf("US"), finalState.sportsWidgetState.countriesSelected)
        assertTrue(finalState.sportsWidgetState.hasSkippedFollowTeam)
        assertFalse(finalState.sportsWidgetState.isVisible)
    }
}
