/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.library.history

import android.content.Context
import android.os.Parcelable
import android.text.format.DateUtils
import java.time.Instant
import java.time.ZoneId
import java.util.Calendar
import kotlinx.parcelize.Parcelize

/**
 * Represents a group of history items for a specific date.
 *
 * @property timestamp The timestamp representing the start of the day for this group.
 */
@Parcelize
data class HistoryItemTimeGroup(val timestamp: Long) : Parcelable {

    /** Returns the date in ISO 8601 format (YYYY-MM-DD). */
    fun toIsoDateString(): String {
        return Instant.ofEpochMilli(timestamp).atZone(ZoneId.systemDefault()).toLocalDate().toString()
    }

    fun humanReadable(context: Context): String =
        DateUtils.formatDateTime(
            context,
            timestamp,
            DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR,
        )

    companion object {
        internal fun timeGroupForTimestamp(timestamp: Long): HistoryItemTimeGroup {
            val calendar =
                Calendar.getInstance().apply {
                    timeInMillis = timestamp
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }
            return HistoryItemTimeGroup(calendar.timeInMillis)
        }
    }
}
