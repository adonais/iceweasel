/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionProvider
import mozilla.components.concept.awesomebar.AwesomeBar.SuggestionProviderGroup
import mozilla.components.support.test.mock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.spy

@RunWith(AndroidJUnit4::class)
class SuggestionFetcherTest {

    @Test
    fun `GIVEN a suggestion group THEN the group's priority becomes highest suggestions' score within the group`() =
        runTest {
            val provider: SuggestionProvider = mock()
            val providerGroup = SuggestionProviderGroup(listOf(provider))
            val suggestions =
                listOf(
                    AwesomeBar.Suggestion(provider = provider, score = Int.MAX_VALUE),
                    AwesomeBar.Suggestion(provider = provider, score = Int.MIN_VALUE),
                )
            val fetcher = spy(SuggestionFetcher(listOf(providerGroup), null))

            fetcher.processResultFrom(
                group = providerGroup,
                provider = provider,
                suggestions = suggestions,
                profilerStartTime = null,
            )

            assertEquals(providerGroup.priority, Int.MAX_VALUE)
        }

    /**
     * The provider coroutines must be children of whoever called [SuggestionFetcher.fetch] - that is how the
     * AwesomeBar's LaunchedEffect tears them down, both when the query changes and when it leaves composition.
     * Launching them into a scope of the fetcher's own making instead leaves a provider suspended forever, holding
     * everything it references. See bug 2071079.
     */
    @Test
    fun `GIVEN a fetch in progress WHEN the calling coroutine is cancelled THEN the provider is cancelled`() =
        runBlocking {
            val provider = SuspendingSuggestionProvider()
            val fetcher = SuggestionFetcher(listOf(SuggestionProviderGroup(listOf(provider))), null)

            // Not the runBlocking dispatcher: the awaits below block this thread.
            val caller = launch(Dispatchers.Default) { fetcher.fetch("test") }
            assertTrue("provider never started", provider.awaitStarted())

            caller.cancel()

            assertTrue("provider was not cancelled", provider.awaitCancelled())
            assertEquals(emptyMap<SuggestionProviderGroup, List<AwesomeBar.SuggestionItem>>(), fetcher.state.value)
        }
}

/** Provider that stays inside [onInputChanged] until cancelled, so a fetch can be torn down mid-flight. */
private class SuspendingSuggestionProvider : SuggestionProvider {
    override val id: String = "suspending-provider"

    private val started = CountDownLatch(1)
    private val cancelled = CountDownLatch(1)

    override suspend fun onInputChanged(text: String): List<AwesomeBar.Suggestion> =
        try {
            started.countDown()
            awaitCancellation()
        } catch (e: CancellationException) {
            cancelled.countDown()
            throw e
        }

    fun awaitStarted() = started.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)

    fun awaitCancelled() = cancelled.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)

    private companion object {
        const val TIMEOUT_SECONDS = 5L
    }
}
