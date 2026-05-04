/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.text.NumberFormat
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val MILLIS_PER_MINUTE = 60_000L
private const val MINS_PER_DAY = 1440L
private const val MINS_PER_HOUR = 60L

internal fun countdownFlow(
    utcDate: String,
    clock: () -> Long = System::currentTimeMillis,
): Flow<CountdownTime> = flow {
    val epochMillis = parseUtcDate(utcDate)
    val formatter = NumberFormat.getIntegerInstance().apply {
        minimumIntegerDigits = 2
        isGroupingUsed = false
    }
    while (true) {
        val now = clock()
        emit(computeCountdown(epochMillis, now, formatter))

        if (epochMillis == null || now >= epochMillis) break

        delay(MILLIS_PER_MINUTE - now % MILLIS_PER_MINUTE)
    }
}

private fun computeCountdown(
    epochMillis: Long?,
    nowMillis: Long,
    formatter: NumberFormat,
): CountdownTime {
    val zero = formatter.format(0)
    if (epochMillis == null) return CountdownTime(zero, zero, zero)

    val remaining = (epochMillis - nowMillis).coerceAtLeast(0L)
    val totalMins = remaining / MILLIS_PER_MINUTE
    val days = totalMins / MINS_PER_DAY
    val hours = (totalMins % MINS_PER_DAY) / MINS_PER_HOUR
    val mins = totalMins % MINS_PER_HOUR

    return CountdownTime(
        days = formatter.format(days),
        hours = formatter.format(hours),
        mins = formatter.format(mins),
    )
}

private fun parseUtcDate(utcDate: String): Long? = try {
    ZonedDateTime.parse(utcDate, DateTimeFormatter.ISO_DATE_TIME).toInstant().toEpochMilli()
} catch (e: DateTimeParseException) {
    null
}

/**
 * Checks if the world cup has started using the device's date
 */
fun hasWorldCupStarted(): Boolean {
    val worldCupYear = 2026
    val worldCupMonth = 6
    val worldCupDay = 11
    return LocalDate.now() >= LocalDate.of(worldCupYear, worldCupMonth, worldCupDay)
}
