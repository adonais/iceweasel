/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import androidx.compose.material3.Surface
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.compose.base.theme.Theme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.theme.FirefoxTheme

@RunWith(AndroidJUnit4::class)
class TopSitesExpandToggleTest {

    @get:Rule val composeTestRule = createComposeRule()

    private fun setTopSitesContent(
        count: Int,
        showExpandToggle: Boolean,
        isExpanded: Boolean,
        onExpandToggleClick: () -> Unit = {},
    ) {
        val topSites =
            FakeHomepagePreview.topSites(
                providedCount = 0,
                pinnedCount = 0,
                defaultCount = count,
            )
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    TopSites(
                        topSites = topSites,
                        onTopSiteClick = {},
                        onTopSiteLongClick = {},
                        onTopSiteImpression = { _, _ -> },
                        onOpenInPrivateTabClicked = {},
                        onEditTopSiteClicked = {},
                        onRemoveTopSiteClicked = {},
                        onSettingsClicked = {},
                        onSponsorPrivacyClicked = {},
                        onTopSitesItemBound = {},
                        onAddShortcutClicked = {},
                        onExpandToggleClick = onExpandToggleClick,
                        showExpandToggle = showExpandToggle,
                        isExpanded = isExpanded,
                    )
                }
            }
        }
    }

    @Test
    fun `GIVEN the toggle is hidden WHEN rendered THEN no expand control is shown`() {
        setTopSitesContent(count = 12, showExpandToggle = false, isExpanded = false)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.EXPAND_TOGGLE).assertCountEquals(0)
    }

    @Test
    fun `GIVEN more sites than fit WHEN collapsed THEN only the collapsed limit is rendered`() {
        setTopSitesContent(count = 12, showExpandToggle = true, isExpanded = false)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(TOP_SITES_TO_SHOW)
    }

    @Test
    fun `GIVEN more sites than fit WHEN expanded THEN every site is rendered`() {
        setTopSitesContent(count = 12, showExpandToggle = true, isExpanded = true)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(12)
    }

    @Test
    fun `GIVEN the section is collapsed WHEN rendered THEN the expand label is shown`() {
        setTopSitesContent(count = 12, showExpandToggle = true, isExpanded = false)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).assertIsDisplayed()
        composeTestRule.onNodeWithText("Show all").assertIsDisplayed()
    }

    @Test
    fun `GIVEN the section is expanded WHEN rendered THEN the collapse label is shown`() {
        setTopSitesContent(count = 12, showExpandToggle = true, isExpanded = true)

        composeTestRule.onNodeWithText("Show less").assertIsDisplayed()
    }

    @Test
    fun `WHEN the toggle is clicked THEN the callback is invoked`() {
        var clicked = false
        setTopSitesContent(
            count = 12,
            showExpandToggle = true,
            isExpanded = false,
            onExpandToggleClick = { clicked = true },
        )

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        assertTrue(clicked)
    }

    private fun setStatefulTopSitesContent(
        count: Int,
        isAddShortcutEnabled: Boolean = false,
        showExpandToggle: Boolean = true,
    ) {
        val state =
            TopSiteState(
                topSites =
                    FakeHomepagePreview.topSites(
                        providedCount = 0,
                        pinnedCount = 0,
                        defaultCount = count,
                    ),
                colors =
                    TopSiteColors(
                        titleTextColor = Color.Black,
                        sponsoredTextColor = Color.Black,
                        faviconCardBackgroundColor = Color.White,
                    ),
                isAddShortcutEnabled = isAddShortcutEnabled,
                showExpandToggle = showExpandToggle,
            )
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                Surface {
                    TopSites(
                        state = state,
                        interactor = FakeHomepagePreview.topSitesInteractor,
                        onTopSitesItemBound = {},
                        onAddShortcutClicked = {},
                    )
                }
            }
        }
    }

    @Test
    fun `GIVEN the section starts collapsed WHEN the toggle is clicked THEN every site is shown`() {
        setStatefulTopSitesContent(count = 12)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(TOP_SITES_TO_SHOW)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(12)
    }

    @Test
    fun `GIVEN the experiment is off and more sites than fit THEN the grid is truncated with no toggle or tile`() {
        setStatefulTopSitesContent(
            count = 12,
            isAddShortcutEnabled = true,
            showExpandToggle = false,
        )

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(TOP_SITES_TO_SHOW)
        composeTestRule.onAllNodesWithTag(TopSitesTestTag.EXPAND_TOGGLE).assertCountEquals(0)
        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(0)
    }

    @Test
    fun `GIVEN the experiment is off and fewer sites than fit THEN the add shortcut tile is shown`() {
        setStatefulTopSitesContent(
            count = 5,
            isAddShortcutEnabled = true,
            showExpandToggle = false,
        )

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(5)
        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(1)
    }

    @Test
    fun `GIVEN exactly the collapsed limit WHEN the toggle is clicked THEN the add shortcut tile is revealed`() {
        setStatefulTopSitesContent(count = TOP_SITES_TO_SHOW, isAddShortcutEnabled = true)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(0)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(TOP_SITES_TO_SHOW)
        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(1)
    }

    @Test
    fun `GIVEN exactly the collapsed limit and expanded WHEN the toggle is clicked THEN the tile is hidden again`() {
        setStatefulTopSitesContent(count = TOP_SITES_TO_SHOW, isAddShortcutEnabled = true)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()
        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(0)
    }

    @Test
    fun `GIVEN more than the collapsed limit WHEN collapsed THEN the add shortcut tile is hidden`() {
        setStatefulTopSitesContent(count = 12, isAddShortcutEnabled = true)

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(0)
    }

    @Test
    fun `GIVEN more than the collapsed limit WHEN expanded THEN the add shortcut tile is shown`() {
        setStatefulTopSitesContent(count = 12, isAddShortcutEnabled = true)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.ADD_SHORTCUT_ROOT).assertCountEquals(1)
    }

    @Test
    fun `GIVEN the section is expanded WHEN the toggle is clicked again THEN it collapses`() {
        setStatefulTopSitesContent(count = 12)

        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()
        composeTestRule.onNodeWithTag(TopSitesTestTag.EXPAND_TOGGLE).performClick()

        composeTestRule.onAllNodesWithTag(TopSitesTestTag.TOP_SITE_ITEM_ROOT).assertCountEquals(TOP_SITES_TO_SHOW)
    }
}
