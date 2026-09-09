/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.selectors.BrowserPageSelectors
import org.mozilla.fenix.ui.efficiency.selectors.HistorySearchGroupSelectors

/**
 * The history search-group screen, reached by tapping a group in the homepage's "Recently visited" section.
 *
 * No navigation edge is registered and this page is deliberately absent from PageContext: it is entered by clicking a
 * *dynamic* label — the search term — which NavigationRegistry cannot express, and its toolbar title is that same term
 * rather than "History", so HistoryPage's arrival check cannot stand in for it. Tests instantiate this page directly,
 * as they do for [ReaderViewPage].
 */
class HistorySearchGroupPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) :
    BasePage(composeRule) {
    override val pageName = "HistorySearchGroupPage"

    override fun mozGetSelectorsByGroup(group: String): List<Selector> {
        return HistorySearchGroupSelectors.all.filter { it.groups.contains(group) }
    }

    /** Assert the group screen for [searchTerm] is open, and that its items have rendered. */
    fun verifyGroupIsOpen(searchTerm: String): HistorySearchGroupPage {
        mozVerify(HistorySearchGroupSelectors.TOOLBAR_TITLE(searchTerm))
        mozVerify(HistorySearchGroupSelectors.ITEM_URL)
        return this
    }

    /**
     * Delete the item for [url] with the delete cross on its own row.
     *
     * The deletion only commits once the undo snackbar has gone, so this waits it out rather than dismissing it —
     * without that wait a following assertion can observe the item as still present, or the next deletion can race the
     * first.
     */
    fun deleteItemWithRowButton(url: String): HistorySearchGroupPage {
        mozClick(HistorySearchGroupSelectors.ITEM_DELETE_BUTTON(url))
        mozWaitUntilAbsent(BrowserPageSelectors.SNACKBAR)
        return this
    }

    /**
     * Delete the item for [url] by long-pressing it into multi-selection mode and using the overflow menu.
     *
     * The legacy robot reaches the menu with Espresso's openActionBarOverflowOrOptionsMenu, which finds no matching
     * view on this screen; the overflow button is addressed by selector instead.
     */
    fun deleteItemWithMultiSelectOverflow(url: String): HistorySearchGroupPage {
        mozLongClick(HistorySearchGroupSelectors.ITEM_WITH_URL(url))
        mozVerify(HistorySearchGroupSelectors.MULTI_SELECT_OVERFLOW_BUTTON)
        mozClick(HistorySearchGroupSelectors.MULTI_SELECT_OVERFLOW_BUTTON)
        mozClick(HistorySearchGroupSelectors.MULTI_SELECT_DELETE_MENU_ITEM)
        mozWaitUntilAbsent(BrowserPageSelectors.SNACKBAR)
        return this
    }

    /** Back out of the group screen to the homepage, mirroring the legacy exitMenu. */
    fun exitToHomepage(): HistorySearchGroupPage {
        mozPressBackUntilGone(HistorySearchGroupSelectors.NAVIGATION_TOOLBAR)
        return this
    }
}
