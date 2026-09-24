/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object HistorySearchGroupSelectors : SelectorContainer {
    val NAVIGATION_TOOLBAR =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "navigationToolbar",
            description = "Library navigation toolbar",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val ITEM_URL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
            value = "url",
            description = "Search group item URL",
            readiness = PageReadinessProfiles.READY_CONTENT,
        )

    // The screen's toolbar title is the search term itself, which is precisely why HistoryPage cannot stand
    // in for this screen: its arrival check demands the literal "History" title.
    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun TOOLBAR_TITLE(searchTerm: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = searchTerm,
            description = "'$searchTerm' search group toolbar title",
        )

    // Espresso and not UiAutomator, deliberately: this row gets long-pressed to enter multi-selection mode,
    // and UiObject.longClick() is not held long enough for it — the row treats the gesture as a tap and opens
    // the page instead, which silently takes the test to the browser. Espresso's longClick() honours the
    // platform long-press timeout, which is what the legacy robot relies on.
    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun ITEM_WITH_URL(url: String = "") =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_TEXT,
            value = url,
            description = "Search group item '$url'",
        )

    // On this screen the row's overflow view is repurposed as a per-row delete cross carrying the content
    // description "Delete" (HistoryMetadataGroupItemViewHolder). Every row has one, so the row is identified
    // by its sibling URL text, exactly as the legacy robot does.
    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun ITEM_DELETE_BUTTON(url: String = "") =
        Selector(
            strategy = SelectorStrategy.ESPRESSO_BY_ID_WITH_SIBLING_TEXT,
            value = "overflow_menu",
            secondaryValue = url,
            description = "Delete button for '$url'",
        )

    // The multi-selection toolbar's overflow button. Espresso's openActionBarOverflowOrOptionsMenu, which the
    // legacy robot uses, finds no matching view here; going through a selector also means a failure produces
    // a screen dump instead of a bare NoMatchingViewException.
    val MULTI_SELECT_OVERFLOW_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
            value = getStringResource(R.string.content_description_menu),
            description = "Multi-select toolbar overflow button",
        )

    // The Delete entry in the multi-selection toolbar's overflow menu. Matched on text, which the per-row
    // delete crosses do not have — they carry "Delete" as a content description only.
    val MULTI_SELECT_DELETE_MENU_ITEM =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.history_delete_item),
            description = "Multi-select overflow Delete menu item",
        )
}
