/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

/** Enumeration of final outcomes for a test or step. */
enum class TestStatus {
    PASS,
    FAIL,
    SKIP,
}

/**
 * Lightweight metadata describing a logical step within a factory test.
 *
 * Used for structured logging and correlation between summary and JSON outputs.
 *
 * @property id Unique short identifier (e.g., `"presence-0"`).
 * @property name Human-readable step name (e.g., `"Navigate.To.Home"`).
 * @property args Optional arguments relevant to the step (for traceability).
 */
data class StepDescriptor(
    val id: String,
    val name: String,
    val args: Map<String, Any?> = emptyMap(),
)

/**
 * Core logging interface for test factories.
 *
 * The factories never write directly to files — they only emit events through a [StepLogger]. Implementations (e.g.,
 * [CombinedLogger]) then route these events to one or more sinks ([SummarySink], [JsonSink]).
 *
 * Typical event sequence per suite:
 * ```
 * testStart()
 *   stepStart()
 *   stepEnd()
 *   ...
 * testEnd()
 * ```
 */
interface StepLogger {

    /** Marks the beginning of a suite (Presence, Interaction, or Behavior). */
    fun testStart(testId: String, meta: Map<String, Any?> = emptyMap())

    /** Marks the end of a suite with a terminal [TestStatus]. */
    fun testEnd(testId: String, status: TestStatus)

    /** Logs the beginning of a discrete step. */
    fun stepStart(step: StepDescriptor)

    /** Logs the end of a step with its resulting [StepResult]. */
    fun stepEnd(step: StepDescriptor, result: StepResult)

    /**
     * Any other structured event, by [type]: a screen dump, a captured artifact, anything a consumer needs to correlate
     * with the steps around it.
     *
     * This replaced `info`/`warn`/`error`/`attachScreenshot`, four methods with no callers between them. A general
     * emitter with one real use beats four specific ones with none, and a consumer filtering on `type` does not care
     * which of them a record came from.
     */
    fun record(type: String, fields: Map<String, Any?> = emptyMap())
}
