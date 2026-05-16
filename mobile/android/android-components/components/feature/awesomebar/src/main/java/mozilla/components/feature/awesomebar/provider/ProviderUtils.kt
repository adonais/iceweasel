/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.provider

import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Locale

internal fun parseIsoDate(
    date: String,
    timeZone: ZoneId,
): LocalDateTime? = try {
    OffsetDateTime.parse(date).atZoneSameInstant(timeZone).toLocalDateTime()
} catch (_: DateTimeParseException) {
    null
}

internal fun formatShortTime(
    dateTime: LocalDateTime,
    locale: Locale,
): String = dateTime.format(
    DateTimeFormatter
        .ofLocalizedTime(FormatStyle.SHORT)
        .withLocale(locale),
)
