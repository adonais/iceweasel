/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.merino.weather

import java.io.IOException
import kotlin.test.assertIs
import kotlinx.coroutines.Job
import kotlinx.serialization.SerializationException
import mozilla.components.concept.base.crash.Breadcrumb
import mozilla.components.concept.base.crash.CrashReporting
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.Request
import mozilla.components.concept.fetch.Response
import mozilla.components.support.test.any
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.file.loadResourceAsString
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.verify

class MerinoWeatherProviderTest {

    private lateinit var client: Client
    private lateinit var crashReporter: FakeCrashReporter

    @Before
    fun setup() {
        client = getClient()
        crashReporter = FakeCrashReporter()
    }

    @Test
    fun `GIVEN a successful status response WHEN the weather forecast is fetched THEN return the forecasts from the response`() {
        val forecasts = MerinoWeatherProvider(client).getWeatherForecast()

        assertEquals(5, forecasts.size)

        val forecast = forecasts.first()
        assertEquals("2026-08-03T23:00:00-04:00", forecast.dateTime)
        assertEquals(1785812400L, forecast.epochDateTime)
        assertEquals(19, forecast.temperature.c)
        assertEquals(66, forecast.temperature.f)
        assertEquals(
            "https://example.com/en/ca/toronto/m5h/hourly-weather-forecast/55488" +
                "?day=1&hbhhour=23&lang=en-us&partner=web_mozilla_adc",
            forecast.url,
        )
        assertEquals("Clear", forecast.summary)
    }

    @Test
    fun `GIVEN the response is an empty array WHEN the weather forecast is fetched THEN return an empty list`() {
        client = getClient(jsonResponse = "[]")

        assertTrue(MerinoWeatherProvider(client).getWeatherForecast().isEmpty())
    }

    @Test
    fun `GIVEN a 500 status response WHEN the weather forecast is fetched THEN return an empty list and no crash report is submitted`() {
        client = getClient(status = 500)
        val provider = MerinoWeatherProvider(client = client, crashReporter = crashReporter)

        assertTrue(provider.getWeatherForecast().isEmpty())
        assertTrue(crashReporter.breadcrumbs.isEmpty())
        assertTrue(crashReporter.exceptions.isEmpty())
    }

    @Test
    fun `GIVEN the request fails with a network error WHEN the weather forecast is fetched THEN return an empty list and no crash report is submitted`() {
        client = mock()
        doThrow(IOException("offline")).`when`(client).fetch(any())
        val provider = MerinoWeatherProvider(client = client, crashReporter = crashReporter)

        assertTrue(provider.getWeatherForecast().isEmpty())
        assertTrue(crashReporter.breadcrumbs.isEmpty())
        assertTrue(crashReporter.exceptions.isEmpty())
    }

    @Test
    fun `GIVEN the response body is malformed WHEN the weather forecast is fetched THEN return an empty list and the exception is reported`() {
        client = getClient(jsonResponse = "not json")
        val provider = MerinoWeatherProvider(client = client, crashReporter = crashReporter)

        assertTrue(provider.getWeatherForecast().isEmpty())

        assertEquals(1, crashReporter.breadcrumbs.size)
        assertEquals(
            "MerinoWeatherProvider - Failed to deserialize weather forecast",
            crashReporter.breadcrumbs.first().message,
        )

        assertEquals(1, crashReporter.exceptions.size)
        assertIs<SerializationException>(crashReporter.exceptions.first())
    }

    @Test
    fun `GIVEN no location nor language parameters are provided WHEN the weather forecast is fetched THEN no query string or headers are sent`() {
        MerinoWeatherProvider(client).getWeatherForecast()

        val request = capturedRequest()
        assertEquals(WEATHER_ENDPOINT_URL, request.url)
        assertNull(request.headers)
        assertTrue(request.conservative)
    }

    @Test
    fun `GIVEN location and language parameters are provided WHEN the weather forecast is fetched THEN the parameters are added to the request URL and headers`() {
        MerinoWeatherProvider(client)
            .getWeatherForecast(
                region = "CA",
                country = "US",
                city = "San Francisco",
                acceptLanguage = "en-US",
            )

        val request = capturedRequest()
        assertEquals(
            "$WEATHER_ENDPOINT_URL?country=US&region=CA&city=San+Francisco",
            request.url,
        )
        assertEquals("en-US", request.headers?.get(ACCEPT_LANGUAGE_HEADER))
        assertTrue(request.conservative)
    }

    @Test
    fun `GIVEN comma separated regions are provided WHEN the weather forecast is fetched THEN the regions are added to the request URL`() {
        MerinoWeatherProvider(client).getWeatherForecast(region = "CA,NY,TX")

        val request = capturedRequest()
        assertEquals("$WEATHER_ENDPOINT_URL?region=CA%2CNY%2CTX", request.url)
        assertNull(request.headers)
        assertTrue(request.conservative)
    }

    @Test
    fun `GIVEN only some location parameters are provided WHEN the weather forecast is fetched THEN only those are added to the URL`() {
        MerinoWeatherProvider(client).getWeatherForecast(country = "CA")

        val request = capturedRequest()
        assertEquals("$WEATHER_ENDPOINT_URL?country=CA", request.url)
        assertNull(request.headers)
        assertTrue(request.conservative)
    }

    private fun getClient(
        jsonResponse: String = loadResourceAsString("/forecast.json"),
        status: Int = 200,
    ): Client {
        val mockedClient = mock<Client>()
        val mockedResponse = mock<Response>()
        val mockedBody = mock<Response.Body>()

        whenever(mockedBody.string(any())).thenReturn(jsonResponse)
        whenever(mockedResponse.body).thenReturn(mockedBody)
        whenever(mockedResponse.status).thenReturn(status)
        whenever(mockedClient.fetch(any())).thenReturn(mockedResponse)

        return mockedClient
    }

    private fun capturedRequest(): Request {
        val request = argumentCaptor<Request>()
        verify(client).fetch(request.capture())
        return request.value
    }

    private class FakeCrashReporter : CrashReporting {
        val breadcrumbs = mutableListOf<Breadcrumb>()
        val exceptions = mutableListOf<Throwable>()

        override fun recordCrashBreadcrumb(breadcrumb: Breadcrumb) {
            breadcrumbs.add(breadcrumb)
        }

        override fun submitCaughtException(throwable: Throwable): Job {
            exceptions.add(throwable)
            return Job()
        }
    }
}
