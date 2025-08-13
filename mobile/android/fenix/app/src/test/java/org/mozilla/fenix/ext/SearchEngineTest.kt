/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import io.mockk.every
import io.mockk.mockk
import mozilla.components.browser.state.search.SearchEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.search.BOOKMARKS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.HISTORY_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.TABS_SEARCH_ENGINE_ID
import java.util.UUID

class SearchEngineTest {

    @Test
    fun `custom search engines are identified correctly`() {
        val searchEngine = SearchEngine(
            id = UUID.randomUUID().toString(),
            name = "Not custom",
            icon = mockk(),
            type = SearchEngine.Type.BUNDLED,
            resultUrls = listOf(
                "https://www.startpage.com/sp/search?q={searchTerms}",
            ),
        )

        val customSearchEngine = SearchEngine(
            id = UUID.randomUUID().toString(),
            name = "Custom",
            icon = mockk(),
            type = SearchEngine.Type.CUSTOM,
            resultUrls = listOf(
                "https://www.startpage.com/sp/search?q={searchTerms}",
            ),
        )

        assertFalse(searchEngine.isCustomEngine())
        assertTrue(customSearchEngine.isCustomEngine())
    }

    @Test
    fun `well known search engines are identified correctly`() {
        val searchEngine = SearchEngine(
            id = UUID.randomUUID().toString(),
            name = "Not well known",
            icon = mockk(),
            type = SearchEngine.Type.BUNDLED,
            resultUrls = listOf(
                "https://www.random.com/sp/search?q={searchTerms}",
            ),
        )

        val wellKnownSearchEngine = SearchEngine(
            id = UUID.randomUUID().toString(),
            name = "Well known",
            icon = mockk(),
            type = SearchEngine.Type.CUSTOM,
            resultUrls = listOf(
                "https://www.startpage.com/sp/search?q={searchTerms}",
            ),
        )

        assertFalse(searchEngine.isKnownSearchDomain())
        assertTrue(wellKnownSearchEngine.isKnownSearchDomain())
    }

    @Test
    fun `GIVEN engine is null WHEN getting the toolbar hint THEN returns search_hint`() {
        assertEquals(
            R.string.search_hint,
            null.toolbarHintRes(defaultEngine = null),
        )
    }

    @Test
    fun `GIVEN the history search engine WHEN getting the toolbar hint THEN returns history_search_hint`() {
        val engine = mockk<SearchEngine>().apply {
            every { id } returns HISTORY_SEARCH_ENGINE_ID
            every { type } returns SearchEngine.Type.APPLICATION
            every { isGeneral } returns false
        }

        assertEquals(
            R.string.history_search_hint,
            engine.toolbarHintRes(defaultEngine = null),
        )
    }

    @Test
    fun `GIVEN the bookmarks search engine WHEN getting the toolbar hint THEN returns bookmark_search_hint`() {
        val engine = mockk<SearchEngine>().apply {
            every { id } returns BOOKMARKS_SEARCH_ENGINE_ID
            every { type } returns SearchEngine.Type.APPLICATION
            every { isGeneral } returns false
        }

        assertEquals(
            R.string.bookmark_search_hint,
            engine.toolbarHintRes(defaultEngine = null),
        )
    }

    @Test
    fun `GIVEN the tabs search engine WHEN getting the toolbar hint THEN returns tab_search_hint`() {
        val engine = mockk<SearchEngine>().apply {
            every { id } returns TABS_SEARCH_ENGINE_ID
            every { type } returns SearchEngine.Type.APPLICATION
            every { isGeneral } returns false
        }

        assertEquals(
            R.string.tab_search_hint,
            engine.toolbarHintRes(defaultEngine = null),
        )
    }

    @Test
    fun `GIVEN an application search engine WHEN getting the toolbar hint THEN returns application_search_hint`() {
        val engine = mockk<SearchEngine>().apply {
            every { id } returns "foo-bar"
            every { type } returns SearchEngine.Type.APPLICATION
            every { isGeneral } returns false
        }

        assertEquals(
            R.string.application_search_hint,
            engine.toolbarHintRes(defaultEngine = null),
        )
    }

    @Test
    fun `GIVEN the default general search engine WHEN getting the toolbar hint THEN returns search_hint`() {
        val defaultEngine = mockk<SearchEngine>().apply {
            every { id } returns "def"
            every { type } returns SearchEngine.Type.BUNDLED
            every { isGeneral } returns true
        }

        val engine = mockk<SearchEngine>().apply {
            every { id } returns defaultEngine.id
            every { type } returns SearchEngine.Type.BUNDLED
            every { isGeneral } returns true
        }

        assertEquals(
            R.string.search_hint,
            engine.toolbarHintRes(defaultEngine),
        )
    }

    @Test
    fun `GIVEN a non-default general search engine WHEN getting the toolbar hint THEN returns search_hint_general_engine`() {
        val defaultEngine = mockk<SearchEngine>().apply {
            every { id } returns "def"
            every { type } returns SearchEngine.Type.BUNDLED
            every { isGeneral } returns true
        }

        val engine = mockk<SearchEngine>().apply {
            every { id } returns "other"
            every { type } returns SearchEngine.Type.BUNDLED
            every { isGeneral } returns true
        }

        assertEquals(
            R.string.search_hint_general_engine,
            engine.toolbarHintRes(defaultEngine),
        )
    }

    @Test
    fun `GIVEN a custom search engine WHEN getting the toolbar hint THEN returns application_search_hint`() {
        val engine = mockk<SearchEngine>().apply {
            every { id } returns "cust"
            every { type } returns SearchEngine.Type.CUSTOM
            every { isGeneral } returns false
        }

        assertEquals(
            R.string.application_search_hint,
            engine.toolbarHintRes(defaultEngine = null),
        )
    }
}
