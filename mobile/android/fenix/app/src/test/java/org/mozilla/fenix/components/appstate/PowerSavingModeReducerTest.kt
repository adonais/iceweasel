/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.components.appstate.AppAction.PowerSavingModeAction

class PowerSavingModeReducerTest {
    @Test
    fun `WHEN Power Saving Mode becomes active THEN the state is updated`() {
        val finalState = AppStoreReducer.reduce(AppState(), PowerSavingModeAction.Changed(isActive = true))

        assertTrue(finalState.isPowerSavingModeActive)
    }

    @Test
    fun `WHEN Power Saving Mode becomes inactive THEN the state is updated`() {
        val initialState = AppState(isPowerSavingModeActive = true)

        val finalState = AppStoreReducer.reduce(initialState, PowerSavingModeAction.Changed(isActive = false))

        assertFalse(finalState.isPowerSavingModeActive)
    }

    @Test
    fun `WHEN reader view is forced on a tab THEN the tab is tracked`() {
        val initialState = AppState(powerSavingModeReaderViewTabIds = setOf("tab-1"))

        val finalState = AppStoreReducer.reduce(initialState, PowerSavingModeAction.ReaderViewForced("tab-2"))

        assertEquals(setOf("tab-1", "tab-2"), finalState.powerSavingModeReaderViewTabIds)
    }

    @Test
    fun `WHEN tabs leave their forced reader view THEN they are no longer tracked`() {
        val initialState = AppState(powerSavingModeReaderViewTabIds = setOf("tab-1", "tab-2", "tab-3"))

        val finalState =
            AppStoreReducer.reduce(initialState, PowerSavingModeAction.ForcedReaderViewLeft(setOf("tab-1", "tab-3")))

        assertEquals(setOf("tab-2"), finalState.powerSavingModeReaderViewTabIds)
    }
}
