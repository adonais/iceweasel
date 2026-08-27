/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.merino.weather

import androidx.annotation.WorkerThread
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import mozilla.components.concept.base.crash.Breadcrumb
import mozilla.components.concept.base.crash.CrashReporting
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.MutableHeaders
import mozilla.components.concept.fetch.Request
import mozilla.components.support.base.ext.fetchBodyOrNull
import mozilla.components.support.base.log.logger.Logger
import java.net.URLEncoder

internal const val WEATHER_ENDPOINT_URL =
    "https://merino.services.mozilla.com/api/v1/weather/hourly-forecasts"
internal const val ACCEPT_LANGUAGE_HEADER = "Accept-Language"

/**
 * Provides access to the Merino weather API.
 *
 * @property client [Client] used for interacting with the Merino HTTP API.
 * @property endPointUrl The url of the endpoint to fetch from. Defaults to [WEATHER_ENDPOINT_URL].
 * @property crashReporter [CrashReporting] instance used for recording caught exceptions.
 */
class MerinoWeatherProvider(
    private val client: Client,
    private val endPointUrl: String = WEATHER_ENDPOINT_URL,
    private val crashReporter: CrashReporting? = null,
) {

    private val logger = Logger("MerinoWeatherProvider")
    private val json = Json {
        ignoreUnknownKeys = true
        useAlternativeNames = false
    }

    /**
     * Fetches the hourly weather forecasts from [endPointUrl].
     *
     * When no location parameters are provided, the Merino service infers the location from the
     * caller's IP address.
     *
     * @param region Optional comma separated string of subdivision codes to provide for the
     * weather forecast request.
     * @param country Optional ISO 3166-2 country code to provide for the weather forecast request.
     * @param city Optional city name to provide for the weather forecast request.
     * @param acceptLanguage Optional value for the `Accept-Language` request header.
     */
    @WorkerThread
    fun getWeatherForecast(
        region: String? = null,
        country: String? = null,
        city: String? = null,
        acceptLanguage: String? = null,
    ): List<MerinoWeatherForecast> {
        val request = Request(
            url = buildUrl(country, region, city),
            headers = acceptLanguage?.let { MutableHeaders(ACCEPT_LANGUAGE_HEADER to it) },
            conservative = true,
        )

        return client.fetchBodyOrNull(request = request, logger = logger)?.let { response ->
            try {
                json.decodeFromString<List<MerinoWeatherForecast>>(response)
            } catch (e: SerializationException) {
                val message = "MerinoWeatherProvider - Failed to deserialize weather forecast"
                logger.error(message = message, throwable = e)
                crashReporter?.recordCrashBreadcrumb(
                    Breadcrumb(message = message),
                )
                crashReporter?.submitCaughtException(e)

                emptyList()
            }
        } ?: emptyList()
    }

    private fun buildUrl(country: String?, region: String?, city: String?): String {
        val params = listOfNotNull(
            country?.let { "country=${it.encode()}" },
            region?.let { "region=${it.encode()}" },
            city?.let { "city=${it.encode()}" },
        )

        return if (params.isEmpty()) {
            endPointUrl
        } else {
            "$endPointUrl?${params.joinToString("&")}"
        }
    }
}

private fun String.encode(): String = URLEncoder.encode(this, Charsets.UTF_8.name())
