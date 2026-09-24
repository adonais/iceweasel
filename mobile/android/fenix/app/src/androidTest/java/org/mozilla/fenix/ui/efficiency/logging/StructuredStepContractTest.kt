/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class StructuredStepContractTest {
    @Test
    fun scopeIdentityCannotOverwriteTheDomainEventType() {
        val file = File.createTempFile("efficiency-step", ".jsonl")
        try {
            val envelope =
                EventEnvelope(
                    ExecutionIdentity(
                        runId = "run",
                        shardId = "shard",
                        dispatchAttemptId = "dispatch",
                        providerAttemptOrdinal = 1,
                        executionPath = "contract",
                        isolation = "process",
                        source = "dispatcher",
                    ),
                    processId = 42,
                )
            val reporter =
                TimedReporter(
                    CombinedLogger(
                        null,
                        JsonSink(file, envelope, ProviderStructuredEventSink.None),
                    )
                )

            reporter.start(TimedReporter.Type.CMD, "command", "click").ok()

            val event = JSONObject(file.readLines().single())
            assertEquals("stepEnd", event.getString("type"))
            assertEquals("CMD", event.getString("scopeType"))
            assertEquals("stepEnd", event.getJSONObject("eventEnvelope").getString("eventType"))
        } finally {
            file.delete()
        }
    }
}
