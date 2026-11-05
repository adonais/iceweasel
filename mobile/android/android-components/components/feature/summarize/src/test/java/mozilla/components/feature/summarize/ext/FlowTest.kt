/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.ext

import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.ui.richtext.parsing.Parser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlowTest {

    private val parser = Parser()

    @Test
    fun `WHEN chunks arrive slower than the throttle THEN every chunk is emitted as a document`() = runTest {
        val documents = pacedFlow(CHUNKS).mapToRichDocument(PAGE_TITLE, StandardTestDispatcher(testScheduler)).toList()

        assertEquals(
            listOf(
                parser.parse("# $PAGE_TITLE\nThe article\n"),
                parser.parse("# $PAGE_TITLE\nThe article\nSome content...\n"),
                parser.parse("# $PAGE_TITLE\nThe article\nSome content...\nSome *bold* content.\n"),
            ),
            documents,
        )
    }

    @Test
    fun `WHEN chunks arrive faster than the throttle THEN one document holds all of them`() = runTest {
        val documents = flowOf(*CHUNKS).mapToRichDocument(PAGE_TITLE, StandardTestDispatcher(testScheduler)).toList()

        assertEquals(listOf(parser.parse("# $PAGE_TITLE\n${CHUNKS.joinToString("")}")), documents)
    }

    @Test
    fun `WHEN chunks arrive at any pace THEN no document is emitted twice in a row`() = runTest {
        listOf(pacedFlow(CHUNKS), flowOf(*CHUNKS)).forEach { chunks ->
            val documents = chunks.mapToRichDocument(PAGE_TITLE, StandardTestDispatcher(testScheduler)).toList()

            assertEquals(0, documents.zipWithNext().count { (previous, next) -> previous == next })
        }
    }

    @Test
    fun `WHEN the page title is empty THEN no heading is added`() = runTest {
        val documents = flowOf(*CHUNKS).mapToRichDocument("", StandardTestDispatcher(testScheduler)).toList()

        assertEquals(parser.parse(CHUNKS.joinToString("")), documents.last())
    }

    @Test
    fun `WHEN no chunk arrives THEN no document is emitted`() = runTest {
        val documents =
            emptyFlow<String>().mapToRichDocument(PAGE_TITLE, StandardTestDispatcher(testScheduler)).toList()

        assertTrue(documents.isEmpty())
    }

    @Test
    fun `WHEN the flow is collected twice THEN both collections produce the same documents`() = runTest {
        val documents = pacedFlow(CHUNKS).mapToRichDocument(PAGE_TITLE, StandardTestDispatcher(testScheduler))

        assertEquals(documents.toList(), documents.toList())
    }

    private fun pacedFlow(chunks: Array<String>): Flow<String> = flow {
        chunks.forEach {
            emit(it)
            delay(1.seconds)
        }
    }

    companion object {
        private const val PAGE_TITLE = "The page title"
        private val CHUNKS = arrayOf("The article\n", "Some content...\n", "Some *bold* content.\n")
    }
}
