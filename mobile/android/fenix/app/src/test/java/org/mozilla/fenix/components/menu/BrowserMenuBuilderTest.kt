/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.ExpandableMenuItem
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.store.MenuEvent
import org.junit.Test
import org.mozilla.fenix.components.menu.FenixMenuItem.CustomizeReaderView
import org.mozilla.fenix.components.menu.FenixMenuItem.FindInPage
import org.mozilla.fenix.components.menu.FenixMenuItem.More
import org.mozilla.fenix.components.menu.MenuPresentationMode.Grid
import org.mozilla.fenix.components.menu.MenuPresentationMode.Row

class BrowserMenuBuilderTest {
    @Test
    fun `WHEN a provider offers an item THEN show it in the section it is configured in`() = runTest {
        val builder = createBrowserMenuBuilder(Row, providing = readerViewItem)

        assertEquals(
            listOf(MenuItemsGroup.Row(id = MENU_GROUP_ID, items = listOf(readerViewItem))),
            builder.menuStructure.first(),
        )
    }

    @Test
    fun `GIVEN a section is configured as a list WHEN building the menu THEN show its items in a list`() = runTest {
        val builder = createBrowserMenuBuilder(Row, providing = readerViewItem)

        assertEquals(
            listOf(MenuItemsGroup.Row(id = MENU_GROUP_ID, items = listOf(readerViewItem))),
            builder.menuStructure.first(),
        )
    }

    @Test
    fun `GIVEN a section is configured as a grid WHEN building the menu THEN show its items in a grid`() = runTest {
        val builder = createBrowserMenuBuilder(Grid, providing = readerViewItem)

        assertEquals(
            listOf(MenuItemsGroup.Grid(id = MENU_GROUP_ID, items = listOf(readerViewItem))),
            builder.menuStructure.first(),
        )
    }

    @Test
    fun `GIVEN a provider offers no items WHEN building the menu THEN don't show the section it would be in`() =
        runTest {
            val builder = createBrowserMenuBuilder(Row, providing = null)

            assertTrue(builder.menuStructure.first().isEmpty())
        }

    @Test
    fun `WHEN an item changes THEN rebuild the menu with it`() = runTest {
        val provided = MutableStateFlow<MenuItem?>(null)
        val builder =
            BrowserMenuBuilder(
                providerResolver = { FakeMenuItemProvider(provided) },
                configuration = sectionOf(Row),
            )

        assertTrue(builder.menuStructure.first().isEmpty())

        provided.value = readerViewItem

        assertEquals(listOf(readerViewItem), builder.menuStructure.first().single().items)
    }

    @Test
    fun `WHEN building the default menu THEN keep the sections in the configured order`() = runTest {
        val builder = BrowserMenuBuilder(providerResolver = { FakeMenuItemProvider(MutableStateFlow(readerViewItem)) })

        assertEquals(BrowserMenuBuilder.DEFAULT.map { it.id }, builder.menuStructure.first().map { it.id })
    }

    @Test
    fun `GIVEN a section is configured as sticky WHEN building the menu THEN keep it sticky`() = runTest {
        val configuration =
            listOf(
                MenuSectionConfiguration(
                    id = MENU_GROUP_ID,
                    presentationMode = Row,
                    items = listOf(CustomizeReaderView),
                    isSticky = true,
                )
            )
        val builder =
            BrowserMenuBuilder(
                providerResolver = { FakeMenuItemProvider(MutableStateFlow(readerViewItem)) },
                configuration = configuration,
            )

        assertEquals(true, builder.menuStructure.first().isNotEmpty())
        assertEquals(true, configuration.first().isSticky)
    }

    @Test
    fun `GIVEN toolbar is at bottom WHEN building default layout THEN navigation block appears at the bottom`() =
        runTest {
            val builder =
                BrowserMenuBuilder(
                    providerResolver = { FakeMenuItemProvider(MutableStateFlow(readerViewItem)) },
                    isToolbarAtBottom = true,
                )

            assertEquals(BrowserMenuBuilder.BROWSER_MENU_NAVIGATION_ID, builder.menuStructure.first().last().id)
        }

    @Test
    fun `GIVEN toolbar is at top WHEN building default layout THEN navigation block appears at the top`() = runTest {
        val builder =
            BrowserMenuBuilder(
                providerResolver = { FakeMenuItemProvider(MutableStateFlow(readerViewItem)) },
                isToolbarAtBottom = false,
            )

        assertEquals(BrowserMenuBuilder.BROWSER_MENU_NAVIGATION_ID, builder.menuStructure.first().first().id)
    }

    @Test
    fun `GIVEN toolbar is expended WHEN building default layout THEN navigation block appears at the bottom`() =
        runTest {
            val builder =
                BrowserMenuBuilder(
                    providerResolver = { FakeMenuItemProvider(MutableStateFlow(readerViewItem)) },
                    isToolbarAtBottom = false,
                    isExpandedToolbarEnabled = true,
                )

            assertEquals(BrowserMenuBuilder.BROWSER_MENU_NAVIGATION_ID, builder.menuStructure.first().last().id)
        }

    @Test
    fun `GIVEN an item expanding to others WHEN building the menu THEN show inside it what their providers offer`() =
        runTest {
            val builder = createExpandingMenuBuilder(expandingTo = MutableStateFlow(findInPageItem))

            val shown = builder.menuStructure.first().single().items.single()

            assertEquals(moreItem.copy(subMenuItems = listOf(findInPageItem)), shown)
        }

    @Test
    fun `GIVEN nothing is offered for what it expands to WHEN building the menu THEN don't show the item`() = runTest {
        val builder = createExpandingMenuBuilder(expandingTo = MutableStateFlow(null))

        assertTrue(builder.menuStructure.first().isEmpty())
    }

    @Test
    fun `WHEN one of the items another expands to changes THEN rebuild the menu with it`() = runTest {
        val provided = MutableStateFlow<MenuItem?>(null)
        val builder = createExpandingMenuBuilder(expandingTo = provided)

        assertTrue(builder.menuStructure.first().isEmpty())

        provided.value = findInPageItem

        val shown = builder.menuStructure.first().single().items.single()
        assertEquals(moreItem.copy(subMenuItems = listOf(findInPageItem)), shown)
    }

    private fun createExpandingMenuBuilder(
        expandingTo: StateFlow<MenuItem?>,
        header: StateFlow<MenuItem?> = MutableStateFlow(moreItem),
    ) =
        BrowserMenuBuilder(
            providerResolver = { item ->
                when (item) {
                    is More -> FakeExpandableMenuItemProvider(header)
                    else -> FakeMenuItemProvider(expandingTo)
                }
            },
            configuration =
                listOf(
                    MenuSectionConfiguration(
                        id = MENU_GROUP_ID,
                        presentationMode = Row,
                        items = listOf(More(subMenuItems = listOf(FindInPage))),
                    )
                ),
        )

    private fun createBrowserMenuBuilder(
        presentationMode: MenuPresentationMode,
        providing: MenuItem?,
    ) =
        BrowserMenuBuilder(
            providerResolver = { FakeMenuItemProvider(MutableStateFlow(providing)) },
            configuration = sectionOf(presentationMode),
        )

    private fun sectionOf(presentationMode: MenuPresentationMode) =
        listOf(
            MenuSectionConfiguration(
                id = MENU_GROUP_ID,
                presentationMode = presentationMode,
                items = listOf(CustomizeReaderView),
            )
        )

    @Test
    fun `WHEN assembling More THEN use the captured header even if the provider advances`() = runTest {
        var receivedChildren: List<StandardMenuItem>? = null
        val provider =
            object : ExpandableMenuItemProvider {
                override val itemFlow = MutableStateFlow<MenuItem?>(moreItem)

                override fun updateWithSubMenuItems(
                    item: ExpandableMenuItem,
                    subMenuItems: List<StandardMenuItem>,
                ): ExpandableMenuItem? {
                    receivedChildren = subMenuItems

                    itemFlow.value = moreItem.copy(title = Text.String("Newer header"))
                    return super.updateWithSubMenuItems(item, subMenuItems)
                }
            }
        val builder =
            BrowserMenuBuilder(
                providerResolver = { item ->
                    when (item) {
                        is More -> provider
                        FindInPage -> FakeMenuItemProvider(MutableStateFlow(findInPageItem))
                        else -> FakeMenuItemProvider(MutableStateFlow(null))
                    }
                },
                configuration =
                    listOf(
                        MenuSectionConfiguration(
                            id = MENU_GROUP_ID,
                            presentationMode = Row,
                            items = listOf(More(listOf(FindInPage, CustomizeReaderView))),
                        )
                    ),
            )

        val shown = builder.menuStructure.first().single().items.single()

        assertEquals(listOf(findInPageItem), receivedChildren)
        assertEquals(moreItem.title, shown.title)
    }

    @Test
    fun `WHEN only the header changes THEN rebuild the expandable item`() = runTest {
        val header = MutableStateFlow<MenuItem?>(moreItem)
        val builder = createExpandingMenuBuilder(MutableStateFlow(findInPageItem), header)
        assertEquals(moreItem.title, builder.menuStructure.first().single().items.single().title)

        header.value = moreItem.copy(title = Text.String("Updated More"))

        assertEquals(Text.String("Updated More"), builder.menuStructure.first().single().items.single().title)
    }

    @Test
    fun `GIVEN the expanding item itself is not offered WHEN building the menu THEN don't show it`() = runTest {
        val builder =
            createExpandingMenuBuilder(
                expandingTo = MutableStateFlow(findInPageItem),
                header = MutableStateFlow(null),
            )

        assertTrue(builder.menuStructure.first().isEmpty())
    }

    @Test
    fun `GIVEN its provider cannot configure what it expands to WHEN building the menu THEN don't show it`() = runTest {
        val builder =
            BrowserMenuBuilder(
                // A plain provider knows nothing about the items this one expands to, so it cannot be shown.
                providerResolver = { item ->
                    when (item) {
                        is More -> FakeMenuItemProvider(MutableStateFlow(moreItem))
                        else -> FakeMenuItemProvider(MutableStateFlow(findInPageItem))
                    }
                },
                configuration =
                    listOf(
                        MenuSectionConfiguration(
                            id = MENU_GROUP_ID,
                            presentationMode = Row,
                            items = listOf(More(subMenuItems = listOf(FindInPage))),
                        )
                    ),
            )

        assertTrue(builder.menuStructure.first().isEmpty())
    }

    private class FakeMenuItemProvider(override val itemFlow: StateFlow<MenuItem?>) : MenuItemProvider

    /** Configures its item with whatever it expands to, which is all an expanding item needs by default. */
    private class FakeExpandableMenuItemProvider(override val itemFlow: StateFlow<MenuItem?>) :
        ExpandableMenuItemProvider

    private data object TestMenuEvent : MenuEvent

    private companion object {
        const val MENU_GROUP_ID = "section"

        val readerViewItem = StandardMenuItem(title = Text.String("Item"), onClickEvent = TestMenuEvent)

        val findInPageItem = StandardMenuItem(title = Text.String("Find in page"), onClickEvent = TestMenuEvent)

        val moreItem =
            ExpandableMenuItem(
                title = Text.String("More"),
                onClickEvent = TestMenuEvent,
                subMenuItems = emptyList(),
            )
    }
}
