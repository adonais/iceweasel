/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal

import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion.Flag
import mozilla.components.support.test.mock
import org.junit.Assert.assertEquals
import org.junit.Test

class SuggestionTest {
    private val url = "https://mozilla.org/%D1%82%D0%B5%D1%81%D1%82%20a"

    @Test
    fun `bookmark and history URLs are shown readable`() {
        listOf(Flag.BOOKMARK, Flag.HISTORY).forEach { flag ->
            val suggestion = Suggestion(mock(), description = url, flags = setOf(flag))

            assertEquals("https://mozilla.org/тест%20a", suggestion.displayDescription())
        }
    }

    @Test
    fun `other descriptions are shown as they are`() {
        listOf(emptySet(), setOf(Flag.CLIPBOARD)).forEach { flags ->
            assertEquals(url, Suggestion(mock(), description = url, flags = flags).displayDescription())
        }
    }

    @Test
    fun `history titles made from the URL are shown readable`() {
        mapOf("mozilla.org/%D1%82%D0%B5%D1%81%D1%82%20a" to "mozilla.org/тест%20a", "Mozilla" to "Mozilla").forEach {
            (title, shown) ->
            val suggestion = Suggestion(mock(), title = title, description = url, flags = setOf(Flag.HISTORY))

            assertEquals(shown, suggestion.displayTitle())
        }
    }

    @Test
    fun `other titles made from the URL are shown as they are`() {
        val title = "mozilla.org/%D1%82%D0%B5%D1%81%D1%82%20a"

        assertEquals(title, Suggestion(mock(), title = title, description = url).displayTitle())
    }
}
