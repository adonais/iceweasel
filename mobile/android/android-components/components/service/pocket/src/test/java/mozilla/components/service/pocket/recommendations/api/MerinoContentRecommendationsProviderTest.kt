/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.api

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.Locale
import mozilla.appservices.merino.CuratedRecommendationLocale
import mozilla.appservices.merino.CuratedRecommendationsApiException
import mozilla.appservices.merino.CuratedRecommendationsClientInterface
import mozilla.components.concept.base.crash.CrashReporting
import mozilla.components.service.pocket.ContentRecommendationsRequestConfig
import mozilla.components.service.pocket.ext.toContentRecommendationsResponse
import mozilla.components.service.pocket.helpers.PocketTestResources
import mozilla.components.service.pocket.helpers.assertResponseIsFailure
import mozilla.components.service.pocket.recommendations.fake.FakeCuratedRecommendationsClient
import mozilla.components.service.pocket.stories.api.PocketResponse
import mozilla.components.support.test.any
import mozilla.components.support.test.mock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify

@RunWith(AndroidJUnit4::class)
class MerinoContentRecommendationsProviderTest {

    @Test
    fun `GIVEN a custom request config WHEN content recommendations are fetched THEN ensure the correct request parameters are used`() {
        val client = FakeCuratedRecommendationsClient()
        val config =
            ContentRecommendationsRequestConfig(
                locale = Locale.US,
                region = "US",
                count = 10,
                topics = listOf("business", "health"),
            )
        val provider =
            provider(
                config = config,
                client = client,
            )

        provider.getContentRecommendations()

        val request = requireNotNull(client.request)
        assertEquals(CuratedRecommendationLocale.EN_US, request.locale)
        assertEquals(config.region, request.region)
        assertEquals(config.count, request.count)
        assertEquals(config.topics, request.topics)
    }

    @Test
    fun `GIVEN no region or topics WHEN content recommendations are fetched THEN the parameters are not sent`() {
        val client = FakeCuratedRecommendationsClient()
        val provider = provider(config = ContentRecommendationsRequestConfig(locale = Locale.US), client = client)

        provider.getContentRecommendations()

        val request = requireNotNull(client.request)
        assertNull(request.region)
        assertNull(request.topics)
    }

    @Test
    fun `GIVEN an unsupported locale WHEN content recommendations are fetched THEN no request is made and return a failure response`() {
        val client = FakeCuratedRecommendationsClient()
        val provider = provider(config = ContentRecommendationsRequestConfig(locale = Locale.JAPAN), client = client)

        assertResponseIsFailure(provider.getContentRecommendations())
        assertNull(client.request)
    }

    @Test
    fun `WHEN requesting content recommendations returns a successful response THEN return the content recommendations`() {
        val client = FakeCuratedRecommendationsClient(response = PocketTestResources.curatedRecommendationsResponse)
        val provider = provider(client = client)

        val response = provider.getContentRecommendations()

        assertEquals(
            PocketTestResources.curatedRecommendationsResponse.toContentRecommendationsResponse(),
            (response as? PocketResponse.Success)?.data,
        )
    }

    @Test
    fun `WHEN requesting content recommendations fails with a network error THEN return a failure response`() {
        val crashReporter: CrashReporting = mock()
        val exception = CuratedRecommendationsApiException.Network(reason = "No connection")
        val client = FakeCuratedRecommendationsClient(exception = exception)

        val response = provider(client = client, crashReporter = crashReporter).getContentRecommendations()

        assertResponseIsFailure(response)
        verify(crashReporter).recordCrashBreadcrumb(any())
        verify(crashReporter, never()).submitCaughtException(exception)
    }

    @Test
    fun `WHEN requesting content recommendations fails with an unexpected error THEN return a failure response`() {
        val crashReporter: CrashReporting = mock()
        val exception =
            CuratedRecommendationsApiException.Other(
                code = 422.toUShort(),
                reason = "Validation error",
            )
        val client = FakeCuratedRecommendationsClient(exception = exception)

        val response = provider(client = client, crashReporter = crashReporter).getContentRecommendations()

        assertResponseIsFailure(response)
        verify(crashReporter).recordCrashBreadcrumb(any())
        verify(crashReporter).submitCaughtException(exception)
    }

    private fun provider(
        config: ContentRecommendationsRequestConfig = ContentRecommendationsRequestConfig(locale = Locale.US),
        client: CuratedRecommendationsClientInterface,
        crashReporter: CrashReporting? = null,
    ) =
        MerinoContentRecommendationsProvider(
            config = config,
            crashReporter = crashReporter,
            clientProvider = { client },
        )
}
