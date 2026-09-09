/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class TopSiteStateTest {

    @get:Rule val composeTestRule = createComposeRule()

    private fun buildState(
        count: Int,
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
    fun `GIVEN exactly the collapsed limit and the add shortcut tile enabled THEN the toggle is shown`() {
        assertTrue(buildState(count = TOP_SITES_TO_SHOW).showExpandToggle)
    }

    @Test
    fun `GIVEN exactly the collapsed limit and the add shortcut tile disabled THEN the toggle is hidden`() {
        assertFalse(buildState(count = TOP_SITES_TO_SHOW, isAddShortcutEnabled = false).showExpandToggle)
    }

    @Test
    fun `GIVEN more than the collapsed limit THEN the toggle is shown`() {
        assertTrue(buildState(count = TOP_SITES_TO_SHOW + 1).showExpandToggle)
    }

    @Test
    fun `GIVEN fewer than the collapsed limit THEN the toggle is hidden`() {
        assertFalse(buildState(count = TOP_SITES_TO_SHOW - 1).showExpandToggle)
    }

    @Test
    fun `GIVEN the secret setting is off THEN the toggle is hidden and the library button is shown`() {
        val state = buildState(count = TOP_SITES_TO_SHOW + 1, showMoreShortcuts = false)

        assertFalse(state.showExpandToggle)
        assertTrue(state.showShortcutsLibraryButton)
    }

    @Test
    fun `GIVEN the secret setting is on THEN the library button is hidden`() {
        assertFalse(buildState(count = TOP_SITES_TO_SHOW + 1).showShortcutsLibraryButton)
    }
}
