/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.nimbus

import org.junit.Assert.assertEquals
import org.mozilla.experiments.nimbus.NimbusEventStore

/**
 * A [NimbusEventStore] implementation for unit test. Allows asserting conditions on recorded events.
 */
class FakeNimbusEventStore : NimbusEventStore {
    private val recordedEvents = mutableListOf<String>()

    override fun recordEvent(count: Long, eventId: String) {
        for (i in 0 until count) {
            recordedEvents += eventId
        }
    }

    /**
     * Asserts that recorded events are exactly equal to [events] (including order).
     */
    fun assertEventsEqual(events: List<String>) {
        assertEquals(events, recordedEvents)
    }

    /**
     * Asserts that there was only a single event recorded and it's equal to [eventId].
     */
    fun assertSingleEventEquals(eventId: String) {
        assertEquals(eventId, recordedEvents.single())
    }
}
