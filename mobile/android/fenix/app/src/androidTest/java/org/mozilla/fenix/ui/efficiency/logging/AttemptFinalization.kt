/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import org.junit.AssumptionViolatedException

class AttemptFinalization {
    private var bodyOutcome: TestStatus? = null
    private var cleanupStarted = false
    private var cleanupFinished = false
    private val cleanupFailures = linkedSetOf<String>()

    fun reset() {
        bodyOutcome = null
        cleanupStarted = false
        cleanupFinished = false
        cleanupFailures.clear()
    }

    fun recordBody(outcome: TestStatus) {
        bodyOutcome = outcome
    }

    fun beginCleanup() {
        cleanupStarted = true
    }

    fun recordCleanupFailure(stage: String) {
        cleanupStarted = true
        cleanupFailures += stage
    }

    fun finishCleanup() {
        cleanupStarted = true
        cleanupFinished = true
    }

    fun terminalFields(testId: String, finalFailure: Throwable?): Map<String, Any?> {
        val expectedSkipFailure = bodyOutcome == TestStatus.SKIP && finalFailure is AssumptionViolatedException
        val cleanupOutcome =
            when {
                !cleanupStarted -> "NOT_REACHED"
                !cleanupFinished -> "INCOMPLETE"
                cleanupFailures.isNotEmpty() -> "FAILED"
                else -> "VERIFIED"
            }
        val failureOrigins = mutableListOf<String>()
        if (bodyOutcome == TestStatus.FAIL) failureOrigins += "body"
        if (cleanupFailures.isNotEmpty() || cleanupOutcome == "INCOMPLETE") failureOrigins += "cleanup"
        if (finalFailure != null && !expectedSkipFailure && failureOrigins.isEmpty()) {
            failureOrigins += if (bodyOutcome == null) "setup" else "outerRule"
        }
        val complete = bodyOutcome != null && cleanupFinished
        val outcome =
            when {
                (finalFailure != null && !expectedSkipFailure) ||
                    bodyOutcome == TestStatus.FAIL ||
                    cleanupOutcome != "VERIFIED" -> TestStatus.FAIL
                bodyOutcome == TestStatus.SKIP -> TestStatus.SKIP
                bodyOutcome == TestStatus.PASS -> TestStatus.PASS
                else -> TestStatus.FAIL
            }
        return mapOf(
            "terminalSchemaVersion" to SCHEMA_VERSION,
            "testId" to testId,
            "outcome" to outcome.name,
            "bodyOutcome" to (bodyOutcome?.name ?: "UNKNOWN"),
            "cleanupOutcome" to cleanupOutcome,
            "complete" to complete,
            "failureOrigins" to failureOrigins,
            "failedCleanupStages" to cleanupFailures.toList(),
            "terminalThrowableType" to finalFailure?.javaClass?.name,
        )
    }

    companion object {
        const val SCHEMA_VERSION = 1
    }
}
