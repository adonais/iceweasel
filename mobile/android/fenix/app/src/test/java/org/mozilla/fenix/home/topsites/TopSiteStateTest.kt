/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import mozilla.components.compose.base.theme.Theme
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class TopSiteStateTest {

    @get:Rule val composeTestRule = createComposeRule()

    private fun buildState(
        count: Int = 12,
        showMoreShortcuts: Boolean = true,
        isAddShortcutEnabled: Boolean = true,
    ): TopSiteState {
        val settings: Settings =
            mockk(relaxed = true) {
                every { showTopSitesFeature } returns true
                every { this@mockk.showMoreShortcuts } returns showMoreShortcuts
                every { enableAddShortcutsImprovement } returns isAddShortcutEnabled
            }
        val appState =
            AppState(
                topSites =
                    FakeHomepagePreview.topSites(
                        providedCount = 0,
                        pinnedCount = 0,
                        defaultCount = count,
                    )
            )

        lateinit var state: TopSiteState
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                state = checkNotNull(TopSiteState.build(appState = appState, settings = settings))
            }
        }

        return state
    }

    @Test
    fun `GIVEN the secret setting is on THEN the toggle is enabled and the library button is hidden`() {
        val state = buildState()

        assertTrue(state.isExpandToggleEnabled)
        assertFalse(state.showShortcutsLibraryButton)
    }

    @Test
    fun `GIVEN the secret setting is off THEN the toggle is disabled and the library button is shown`() {
        val state = buildState(showMoreShortcuts = false)

        assertFalse(state.isExpandToggleEnabled)
        assertTrue(state.showShortcutsLibraryButton)
    }

    @Test
    fun `GIVEN only a couple of shortcuts THEN the toggle is still enabled`() {
        assertTrue(buildState(count = 2).isExpandToggleEnabled)
    }

    @Test
    fun `GIVEN the add shortcut setting is on THEN it is carried into the state`() {
        assertTrue(buildState(isAddShortcutEnabled = true).isAddShortcutEnabled)
    }

    @Test
    fun `GIVEN the add shortcut setting is off THEN it is carried into the state`() {
        assertFalse(buildState(isAddShortcutEnabled = false).isAddShortcutEnabled)
    }
}
