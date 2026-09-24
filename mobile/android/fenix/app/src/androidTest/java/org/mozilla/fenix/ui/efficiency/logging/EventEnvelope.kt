/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import android.os.Process
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID

data class ExecutionIdentity(
    val runId: String,
    val shardId: String,
    val dispatchAttemptId: String,
    val providerAttemptOrdinal: Int,
    val executionPath: String,
    val isolation: String,
    val source: String,
) {
    companion object {
        fun fromInstrumentation(processId: Int = Process.myPid()): ExecutionIdentity {
            val arguments = runCatching { InstrumentationRegistry.getArguments() }.getOrNull()
            fun argument(name: String): String? = arguments?.getString(name)?.takeIf { it.isNotBlank() }

            val runId = argument(RUN_ID_ARGUMENT)
            val shardId = argument(SHARD_ID_ARGUMENT)
            val dispatchAttemptId = argument(ATTEMPT_ID_ARGUMENT)
            val providerAttemptOrdinal = argument(ATTEMPT_ORDINAL_ARGUMENT)?.toIntOrNull()?.takeIf { it > 0 }
            val executionPath = argument(EXECUTION_PATH_ARGUMENT)
            val isolation = argument(ISOLATION_ARGUMENT)
            val complete =
                listOf(
                        runId,
                        shardId,
                        dispatchAttemptId,
                        providerAttemptOrdinal,
                        executionPath,
                        isolation,
                    )
                    .all { it != null }
            return ExecutionIdentity(
                runId = runId ?: UNASSIGNED,
                shardId = shardId ?: UNASSIGNED,
                dispatchAttemptId = dispatchAttemptId ?: "$UNASSIGNED:$processId:${UUID.randomUUID()}",
                providerAttemptOrdinal = providerAttemptOrdinal ?: 1,
                executionPath = executionPath ?: "local_instrumentation",
                isolation = isolation ?: "unknown",
                source = if (complete) "dispatcher" else "fallback",
            )
        }

        const val RUN_ID_ARGUMENT = "efficiencyRunId"
        const val SHARD_ID_ARGUMENT = "efficiencyShardId"
        const val ATTEMPT_ID_ARGUMENT = "efficiencyAttemptId"
        const val ATTEMPT_ORDINAL_ARGUMENT = "efficiencyAttemptOrdinal"
        const val EXECUTION_PATH_ARGUMENT = "efficiencyExecutionPath"
        const val ISOLATION_ARGUMENT = "efficiencyIsolation"
        const val UNASSIGNED = "unassigned"
    }
}

class EventEnvelope(
    val identity: ExecutionIdentity,
    private val processId: Int = Process.myPid(),
    private val wallTimeMs: () -> Long = System::currentTimeMillis,
    private val monotonicTimeNs: () -> Long = SystemClock::elapsedRealtimeNanos,
) {
    private var activeTestId: String? = null
    private var activeAttemptId: String? = null
    private var sequence = 0L
    private var bodyEnded = false
    private val occurrences = mutableMapOf<String, Int>()

    @Synchronized
    internal fun <T> withEnrichedEvent(fields: Map<String, Any?>, action: (Map<String, Any?>) -> T): T =
        action(enrich(fields))

    @Synchronized
    fun enrich(fields: Map<String, Any?>): Map<String, Any?> {
        val eventType = fields["type"]?.toString() ?: "unknown"
        val explicitTestId = fields["testId"]?.toString()?.takeIf { it.isNotBlank() }
        val testId = explicitTestId ?: activeTestId ?: UNSCOPED_TEST_ID
        val beginsRetry =
            bodyEnded && (eventType == "testStart" || (eventType == "state" && fields["phase"] == "arrival"))
        if (testId != activeTestId || activeAttemptId == null || beginsRetry) {
            startAttempt(testId)
        }
        sequence += 1
        val now = wallTimeMs()
        val eventEnvelope =
            mapOf(
                "eventSchemaVersion" to SCHEMA_VERSION,
                "runId" to identity.runId,
                "shardId" to identity.shardId,
                "testId" to testId,
                "attemptId" to activeAttemptId,
                "dispatchAttemptId" to identity.dispatchAttemptId,
                "providerAttemptOrdinal" to identity.providerAttemptOrdinal,
                "sequence" to sequence,
                "wallTimeMs" to now,
                "monotonicTimeNs" to monotonicTimeNs(),
                "eventType" to eventType,
                "executionPath" to identity.executionPath,
                "isolation" to identity.isolation,
                "identitySource" to identity.source,
                "processId" to processId,
            )
        if (eventType == "testEnd") bodyEnded = true
        return fields +
            mapOf(
                "testId" to testId,
                "ts" to now,
                "eventEnvelope" to eventEnvelope,
            )
    }

    private fun startAttempt(testId: String) {
        val occurrence = (occurrences[testId] ?: 0) + 1
        occurrences[testId] = occurrence
        activeTestId = testId
        activeAttemptId =
            UUID.nameUUIDFromBytes("${identity.dispatchAttemptId}\u0000$testId\u0000$occurrence".toByteArray())
                .toString()
        sequence = 0
        bodyEnded = false
    }

    companion object {
        const val SCHEMA_VERSION = 1
        const val UNSCOPED_TEST_ID = "unscoped"
    }
}

object ProcessEventEnvelope {
    val current: EventEnvelope by lazy { EventEnvelope(ExecutionIdentity.fromInstrumentation()) }
}
