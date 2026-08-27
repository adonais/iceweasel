/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.merino.weather

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * An hourly weather forecast returned by the Merino weather API.
 *
 * @property dateTime The local date and time the forecast applies to, in ISO-8601 format.
 * @property epochDateTime The Unix epoch time of [dateTime].
 * @property temperature The weather forecast [Temperature].
 * @property url The URL of the weather forecast from the provider's website.
 * @property summary A summary description of the weather forecast.
 */
@Serializable
data class MerinoWeatherForecast(
    @SerialName("date_time") val dateTime: String,
    @SerialName("epoch_date_time") val epochDateTime: Long,
    val temperature: Temperature,
    val url: String,
    val summary: String,
)

/**
 * The temperature reading in various units.
 *
 * @property c The temperature in degrees Celsius, if available.
 * @property f The temperature in degrees Fahrenheit, if available.
 */
@Serializable
data class Temperature(
    val c: Int? = null,
    val f: Int? = null,
)
