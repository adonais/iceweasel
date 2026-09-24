/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderAttemptSpoolContractTest {
    @Test
    fun terminalEventCommitsARedactedChecksummedBundle() {
        val storage = MemoryProviderEvidenceStorage()
        val spool = ProviderAttemptSpool(storage)

        spool.append(event(1, "testStart", mapOf("meta" to mapOf("skipOnboarding" to true, "token" to "secret"))))
        spool.append(
            event(
                2,
                "stepEnd",
                mapOf(
                    "scopeType" to "CMD",
                    "outcome" to "FAIL",
                    "verb" to "click",
                    "selectorId" to "menu.open",
                    "backend" to "COMPOSE",
                    "timeoutMs" to 5_000,
                    "attempts" to 3,
                    "lastObservation" to "absent",
                    "navigationEdge" to "HomePage->MainMenuPage",
                    "value" to "private input",
                    "cause" to "secret stack",
                ),
            )
        )
        spool.append(
            event(
                3,
                "attemptEnd",
                mapOf(
                    "outcome" to "FAIL",
                    "bodyOutcome" to "FAIL",
                    "cleanupOutcome" to "VERIFIED",
                    "complete" to true,
                    "failureOrigins" to listOf("body"),
                    "failedCleanupStages" to emptyList<String>(),
                ),
            )
        )

        val key = storage.events.keys.single()
        val bytes = storage.events.getValue(key).toByteArray()
        val records = bytes.decodeToString().lineSequence().filter(String::isNotBlank).map(::JSONObject).toList()
        assertEquals(listOf("testStart", "stepEnd", "attemptEnd"), records.map { it.getString("type") })
        assertEquals("click", records[1].getString("verb"))
        assertEquals("menu.open", records[1].getString("selectorId"))
        assertEquals("COMPOSE", records[1].getString("backend"))
        assertEquals(5_000, records[1].getInt("timeoutMs"))
        assertEquals(3, records[1].getInt("attempts"))
        assertEquals("absent", records[1].getString("lastObservation"))
        assertEquals("HomePage->MainMenuPage", records[1].getString("navigationEdge"))
        assertFalse(records[1].has("value"))
        assertFalse(records[1].has("cause"))
        assertFalse(records[0].getJSONObject("meta").has("token"))

        val manifest = storage.manifests.getValue(key)
        assertEquals("complete", manifest["status"])
        assertEquals(3, manifest["eventCount"])
        assertEquals(true, manifest["sequenceContiguous"])
        val inventory = manifest["evidenceInventory"] as Map<*, *>
        val entry = (inventory["files"] as List<*>).single() as Map<*, *>
        assertEquals(bytes.size.toLong(), entry["sizeBytes"])
        assertEquals(sha256(bytes), entry["sha256"])
        val redaction = manifest["redaction"] as Map<*, *>
        val removed = redaction["removedFieldOccurrences"] as Map<*, *>
        assertEquals(1, removed["value"])
        assertEquals(1, removed["cause"])
        assertEquals(1, removed["meta.token"])
    }

    @Test
    fun processDeathLeavesAnUnfinalizedEventFileWithoutAFalseManifest() {
        val storage = MemoryProviderEvidenceStorage()
        val spool = ProviderAttemptSpool(storage)

        spool.append(event(1, "testStart"))
        spool.append(event(2, "testEnd", mapOf("status" to "PASS")))

        assertTrue(storage.events.values.single().size() > 0)
        assertTrue(storage.manifests.isEmpty())
    }

    @Test
    fun sequenceGapIsFinalizedAsIncompleteEvidence() {
        val storage = MemoryProviderEvidenceStorage()
        val spool = ProviderAttemptSpool(storage)

        spool.append(event(1, "testStart"))
        spool.append(event(3, "attemptEnd", mapOf("outcome" to "PASS", "complete" to true)))

        val manifest = storage.manifests.values.single()
        assertEquals("sequence_incomplete", manifest["status"])
        assertEquals(false, manifest["sequenceContiguous"])
        val inventory = manifest["evidenceInventory"] as Map<*, *>
        assertEquals(false, inventory["complete"])
    }

    @Test
    fun unknownContributorsAndRawSearchEngineIdsAreNotProviderEvidence() {
        val redacted =
            ProviderEvidencePolicy.redact(
                event(
                    1,
                    "stateSnapshot",
                    mapOf(
                        "schemaVersion" to 3,
                        "contributors" to
                            listOf(
                                contributor(
                                    "searchConfiguration",
                                    mapOf("customEngineCount" to 1, "defaultEngineId" to "private-id"),
                                ),
                                contributor("futureSensitiveState", mapOf("secret" to "value")),
                            ),
                    ),
                )
            )

        val contributors = redacted.fields["contributors"] as List<*>
        assertEquals(1, contributors.size)
        val values = (contributors.single() as Map<*, *>)["values"] as Map<*, *>
        assertEquals(1, values["customEngineCount"])
        assertNull(values["defaultEngineId"])
        assertTrue("contributors.futureSensitiveState" in redacted.removedFields)
    }

    @Test
    fun environmentEvidenceUsesExplicitNestedAllowlists() {
        val redacted =
            ProviderEvidencePolicy.redact(
                event(
                    1,
                    "environmentPreflight",
                    mapOf(
                        "requirements" to
                            mapOf(
                                "requiredOrientation" to "PORTRAIT",
                                "mockWebServer" to "AVAILABLE",
                                "secret" to "removed",
                            ),
                        "before" to mapOf("orientation" to 2, "unknown" to "removed"),
                        "after" to mapOf("orientation" to 1, "foregroundWindow" to "launcher"),
                    ),
                )
            )

        assertEquals(
            mapOf("requiredOrientation" to "PORTRAIT", "mockWebServer" to "AVAILABLE"),
            redacted.fields["requirements"],
        )
        assertEquals(mapOf("orientation" to 2), redacted.fields["before"])
        assertEquals(
            mapOf("orientation" to 1, "foregroundWindow" to "launcher"),
            redacted.fields["after"],
        )
        assertTrue("requirements.secret" in redacted.removedFields)
        assertTrue("before.unknown" in redacted.removedFields)
    }

    private fun event(
        sequence: Long,
        type: String,
        fields: Map<String, Any?> = emptyMap(),
    ): Map<String, Any?> =
        mapOf(
            "type" to type,
            "testId" to "method(Test)",
            "ts" to sequence,
            "eventEnvelope" to
                mapOf(
                    "eventSchemaVersion" to 1,
                    "runId" to "run-1",
                    "shardId" to "shard-1",
                    "testId" to "method(Test)",
                    "attemptId" to "attempt-1",
                    "dispatchAttemptId" to "dispatch-1",
                    "providerAttemptOrdinal" to 1,
                    "sequence" to sequence,
                    "wallTimeMs" to sequence,
                    "monotonicTimeNs" to sequence,
                    "eventType" to type,
                    "executionPath" to "direct_fleet",
                    "isolation" to "app_data",
                    "identitySource" to "dispatcher",
                    "processId" to 42,
                ),
        ) + fields

    private fun contributor(name: String, values: Map<String, Any?>): Map<String, Any?> =
        mapOf(
            "name" to name,
            "schemaVersion" to 1,
            "captureCost" to "IN_MEMORY",
            "sensitivity" to "AGGREGATE_ONLY",
            "includeInCompatibilityState" to false,
            "boundaryPolicy" to "OBSERVE",
            "boundaryBaseline" to emptyMap<String, Any?>(),
            "controlDrivers" to emptyList<String>(),
            "complete" to true,
            "values" to values,
        )

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
