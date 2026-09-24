/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

class SelectorContainerContractTest {
    @Test
    fun selectorValsAreDiscoveredWithoutAnInventoryList() {
        assertEquals(listOf(AutoDiscoveredSelectors.FIRST, AutoDiscoveredSelectors.SECOND), AutoDiscoveredSelectors.all)
    }

    @Test
    fun parameterizedSelectorFactoriesAreNotCatalogEntries() {
        val dynamic = AutoDiscoveredSelectors.DYNAMIC("value")

        assertFalse(AutoDiscoveredSelectors.all.contains(dynamic))
    }

    @Test
    fun groupedScrollingSelectorsUseDeclaredTraversalOrder() {
        assertEquals(
            listOf(OrderedSelectors.ANCHOR, OrderedSelectors.TOP, OrderedSelectors.BOTTOM),
            OrderedSelectors.selectorsIn(TestGroup.ITEMS),
        )
    }

    @Test
    fun unorderedGroupedScrollingSelectorsFailCatalogValidation() {
        val error = runCatching { UnorderedSelectors.all }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertTrue(error?.message?.contains("must declare every scrolling selector") == true)
    }

    private object AutoDiscoveredSelectors : SelectorContainer {
        val SECOND = selector("second")
        val FIRST = selector("first")

        @Suppress("FunctionName") fun DYNAMIC(value: String) = selector(value)
    }

    private object OrderedSelectors : SelectorContainer {
        val BOTTOM = selector("bottom", TestGroup.ITEMS, SwipeDirection.UP)
        val ANCHOR = selector("anchor", TestGroup.ITEMS)
        val TOP = selector("top", TestGroup.ITEMS, SwipeDirection.UP)

        override val scrollTraversalOrder: Map<SelectorGroup, List<Selector>> =
            mapOf(TestGroup.ITEMS to listOf(TOP, BOTTOM))
    }

    private object UnorderedSelectors : SelectorContainer {
        val FIRST = selector("first", TestGroup.ITEMS, SwipeDirection.UP)
        val SECOND = selector("second", TestGroup.ITEMS, SwipeDirection.UP)
    }

    private enum class TestGroup : SelectorGroup {
        ITEMS
    }

    private companion object {
        fun selector(
            value: String,
            group: SelectorGroup? = null,
            scrollDirection: SwipeDirection? = null,
        ) =
            Selector(
                strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
                value = value,
                description = value,
                groups = group?.let(::setOf).orEmpty(),
                scrollDirection = scrollDirection,
            )
    }
}
