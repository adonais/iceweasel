/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object CollectionsSelectors {

    val ADD_NEW_COLLECTION_BUTTON = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = "Add new collection",
        description = "Add new collection from tabs tray collections section",
        groups = listOf("tabsTrayCollectionsSection"),
    )

    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun EXISTING_COLLECTION_WITH_TITLE(collectionTitle: String = "") = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = collectionTitle,
        description = "Existing collection: $collectionTitle from the select collection view",
        groups = listOf("selectCollectionView"),
    )

    val TAB_SAVED_SNACK_BAR = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
        value = getStringResource(R.string.create_collection_tab_saved_2),
        description = "Tab saved snackbar",
        groups = listOf(),
    )

    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun COLLECTION_WITH_TITLE(collectionTitle: String = "") = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = collectionTitle,
        description = "Home screen collection with title: $collectionTitle ",
        groups = listOf("collectionItem"),
    )

    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun COLLECTION_TAB_WITH_TITLE(tabTitle: String = "") = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = tabTitle,
        description = "Collection tab with title: $tabTitle ",
        groups = listOf("collectionTabItem"),
    )

    @Suppress("ktlint:standard:function-naming", "FunctionName")
    fun COLLECTION_TAB_WITH_URL(url: String = "") = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT_SUBSTRING,
        value = url,
        description = "Collection tab with url: $url",
        groups = listOf("collectionTabItem"),
    )

    val COLLECTION_ITEM_REMOVE_BUTTON = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
        value = "Remove tab from collection",
        description = "Collection item remove button",
        groups = listOf("collectionControls"),
    )

    val COLLECTION_TAB_SHARE_BUTTON = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
        value = "Share",
        description = "Collection tab share button",
        groups = listOf("collectionControls"),
    )

    val COLLECTION_TAB_MAIN_MENU_BUTTON = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_DESCRIPTION_CONTAINS,
        value = "Collection menu",
        description = "Collection tab main menu button",
        groups = listOf("collectionControls"),
    )

    val OPEN_TABS_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Open tabs",
        description = "Collection tab Open tabs menu button",
        groups = listOf("collectionThreeDotMenu"),
    )

    val DELETE_COLLECTION_BUTTON = Selector(
        strategy = SelectorStrategy.COMPOSE_BY_TEXT,
        value = "Delete collection",
        description = "Collection tab Delete Collection menu button",
        groups = listOf("collectionThreeDotMenu"),
    )

    val all = listOf(
        ADD_NEW_COLLECTION_BUTTON,
        EXISTING_COLLECTION_WITH_TITLE(),
        TAB_SAVED_SNACK_BAR,
        COLLECTION_WITH_TITLE(),
        COLLECTION_TAB_WITH_TITLE(),
        COLLECTION_TAB_WITH_URL(),
        COLLECTION_ITEM_REMOVE_BUTTON,
        COLLECTION_TAB_SHARE_BUTTON,
        COLLECTION_TAB_MAIN_MENU_BUTTON,
        OPEN_TABS_BUTTON,
        DELETE_COLLECTION_BUTTON,
    )
}
