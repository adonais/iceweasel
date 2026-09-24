/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.BookmarkSearchSelectors

class BookmarkSearchPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {
    override val pageName = "BookmarkSearchPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = pageName,
            to = "BookmarksPage",
            steps = listOf(NavigationStep.PressBack),
        )
    }

    override fun navigateToPage(
        url: String,
        forceNavigation: Boolean,
        navigationOptions: NavigationOptions,
    ): BookmarkSearchPage {
        super.navigateToPage(url, forceNavigation, navigationOptions)
        return this
    }

    override val selectorCatalog = BookmarkSearchSelectors

    fun typeSearch(searchTerm: String): BookmarkSearchPage {
        mozClearAndEnterText(searchTerm, BookmarkSearchSelectors.SEARCH_BOX)
        return this
    }

    fun verifySearchSuggestionsAreDisplayed(vararg urls: String): BookmarkSearchPage {
        for (url in urls) {
            mozVerifyAnyContainsText(BookmarkSearchSelectors.SEARCH_ITEM, url)
        }
        return this
    }

    fun verifySuggestionsAreNotDisplayed(vararg urls: String): BookmarkSearchPage {
        for (url in urls) {
            mozVerifyNoneContainText(BookmarkSearchSelectors.SEARCH_ITEM, url)
        }
        return this
    }
}
