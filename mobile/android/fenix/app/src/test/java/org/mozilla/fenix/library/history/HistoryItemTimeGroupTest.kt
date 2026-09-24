/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.library.history

import java.util.Calendar
import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryItemTimeGroupTest {

    @Test
    fun `WHEN grouping history item THEN item is grouped by the start of the day`() {
        val calendar =
            Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 12)
                set(Calendar.MINUTE, 30)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
        val time = calendar.timeInMillis

        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        val expectedStartOfDay = calendar.timeInMillis

        val historyTimeGroup = HistoryItemTimeGroup.timeGroupForTimestamp(time)

        assertEquals(expectedStartOfDay, historyTimeGroup.timestamp)
    }

    @Test
    fun `WHEN converting to ISO date string THEN return YYYY-MM-DD`() {
        val calendar =
            Calendar.getInstance().apply {
                set(2026, Calendar.AUGUST, 26)
            }
        val group = HistoryItemTimeGroup(calendar.timeInMillis)

        assertEquals("2026-08-26", group.toIsoDateString())
    }
}
