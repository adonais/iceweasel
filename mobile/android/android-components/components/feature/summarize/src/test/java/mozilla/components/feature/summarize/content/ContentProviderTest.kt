/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.content

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ContentProviderTest {
    @Test
    fun `that we can provide the page content`() = runTest {
        val title = "title"
        val content = ContentProvider.fromPage(
            pageTitle = title,
            { Result.success("This is the page content") },
            { Result.success(PageMetadata(wordCount = 500)) },
        ).getContent().getOrThrow()

        assertEquals("This is the page content", content.body)
        assertEquals(PageMetadata(wordCount = 500, pageTitle = title), content.metadata)
    }

    @Test
    fun `when the content extractor provides a module error type, it is preserved`() = runTest {
        val content = ContentProvider.fromPage(
            "",
            { Result.failure(PageContentExtractor.Exception(IllegalStateException())) },
            { Result.success(PageMetadata()) },
        ).getContent().exceptionOrNull()

        assertIs<PageContentExtractor.Exception>(content)
    }

    @Test
    fun `that if extracting page metadata fails we recover with default metadata`() = runTest {
        val content = ContentProvider.fromPage(
            "",
            { Result.success("This is the page content") },
            { Result.failure(IllegalStateException()) },
        ).getContent().getOrThrow()

        assertEquals("This is the page content", content.body)
        assertEquals(PageMetadata(), content.metadata)
    }

    @Test
    fun `that if page content provider provides a platform error type, it is mapped to a module type`() = runTest {
        val title = "title"
        val result = ContentProvider.fromPage(
            pageTitle = title,
            { Result.failure(NullPointerException()) },
            { Result.success(PageMetadata(wordCount = 500)) },
        ).getContent().exceptionOrNull()

        assertIs<ContentProvider.Exception>(result)
        assertEquals(true, result.message?.contains("Could not extract content"))
    }
}
