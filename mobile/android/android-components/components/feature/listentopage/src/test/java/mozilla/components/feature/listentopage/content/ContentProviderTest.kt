/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.content

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentProviderTest {
    @Test
    fun `test that fromPage combines the article text and its language`() = runTest {
        val provider =
            ContentProvider.fromPage(
                pageContentExtractor = { Result.success("Article text") },
                pageMetadataExtractor = { Result.success(PageMetadata(languageTag = "de")) },
            )

        val content = provider.getContent("tab-1").getOrThrow()

        assertEquals("Article text", content.text)
        assertEquals("de", content.languageTag)
    }

    @Test
    fun `test that fromPage fails when the text cannot be extracted`() = runTest {
        val error = RuntimeException("Content failed")
        val provider =
            ContentProvider.fromPage(
                pageContentExtractor = { Result.failure(error) },
                pageMetadataExtractor = { Result.success(PageMetadata(languageTag = "en")) },
            )

        val result = provider.getContent("tab-1")

        assertTrue(result.isFailure)
        assertEquals(error, result.exceptionOrNull())
    }

    @Test
    fun `test that fromPage fails when the metadata cannot be extracted`() = runTest {
        val error = RuntimeException("Metadata failed")
        val provider =
            ContentProvider.fromPage(
                pageContentExtractor = { Result.success("Article text") },
                pageMetadataExtractor = { Result.failure(error) },
            )

        val result = provider.getContent("tab-1")

        assertTrue(result.isFailure)
        assertEquals(error, result.exceptionOrNull())
    }

    @Test
    fun `test that the text is not extracted when the metadata fails`() = runTest {
        var contentRequested = false
        val provider =
            ContentProvider.fromPage(
                pageContentExtractor = {
                    contentRequested = true
                    Result.success("Article text")
                },
                pageMetadataExtractor = { Result.failure(RuntimeException("Metadata failed")) },
            )

        provider.getContent("tab-1")

        assertEquals(false, contentRequested)
    }
}
