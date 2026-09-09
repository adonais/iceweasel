/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File

/**
 * Multiplexing logger that fans out high-level messages to:
 *
 * - [SummarySink]: human-readable, line-oriented log (`summary.log`)
 * - [JsonSink]: machine-readable, newline-delimited JSON (`details.jsonl`)
 *
 * This logger is **best-effort**: any sink failure is swallowed and logged to Logcat so logging can never crash a test
 * or mask the root failure.
 *
 * This class implements the [StepLogger] interface used by factories so calling code does not care about concrete sinks
 * or file layout.
 */
class CombinedLogger(
    private val summary: SummarySink?,
    private val json: JsonSink?,
) : StepLogger {

    /**
     * Every event is the same two writes: a human line and a machine record. Both best-effort and independently
     * guarded, because logging must never fail a test or mask the failure it was recording - and a full disk should not
     * cost you the console narrative as well.
     *
     * Null sinks are the no-op logger: the case where the artifact directory could not be created.
     */
    private fun emit(type: String, line: String, fields: Map<String, Any?> = emptyMap()) {
        try {
            summary?.line(line)
        } catch (t: Throwable) {
            android.util.Log.w("CombinedLogger", "summary sink failed during $type: ${t.message}", t)
        }
        try {
            json?.event(mapOf("type" to type) + fields)
        } catch (t: Throwable) {
            android.util.Log.w("CombinedLogger", "json sink failed during $type: ${t.message}", t)
        }
    }

    override fun testStart(testId: String, meta: Map<String, Any?>) =
        emit("testStart", "[TEST] $testId — START", mapOf("testId" to testId, "meta" to meta))

    override fun testEnd(testId: String, status: TestStatus) =
        emit("testEnd", "[TEST] $testId — $status", mapOf("testId" to testId, "status" to status.name))

    // Summary only. stepEnd repeats the name and adds the outcome, so a JSON record here would
    // double the volume of the structured stream to say nothing the next record does not.
    override fun stepStart(step: StepDescriptor) {
        try {
            summary?.line("[STEP] ${step.name} ${step.args} — START")
        } catch (t: Throwable) {
            android.util.Log.w("CombinedLogger", "summary sink failed during stepStart: ${t.message}", t)
        }
    }

    override fun stepEnd(step: StepDescriptor, result: StepResult) {
        val failure = result as? StepResult.Fail
        emit(
            "stepEnd",
            "[STEP] ${step.name} — ${if (failure == null) "PASS" else "FAIL"}",
            // step.args carries the verb's structured facts, including `outcome` (OK/FAIL/SKIP);
            // the cause is the stack that the console line reduces to a single message. There is
            // deliberately no second PASS/FAIL field: two spellings of the same thing invite a
            // consumer to match the one that cannot express a skip.
            step.args +
                mapOf(
                    "stepId" to step.id,
                    "name" to step.name,
                    "reason" to failure?.reason,
                    "cause" to failure?.cause?.stackTraceToString(),
                ),
        )
    }

    override fun record(type: String, fields: Map<String, Any?>) =
        emit(type, "[${type.uppercase()}] " + fields.entries.joinToString(" ") { "${it.key}=${it.value}" }, fields)
}

/**
 * Factory for a ready-to-use [StepLogger] and run-scoped artifact directory.
 *
 * Responsibilities:
 * - Creates `artifacts/<run-id>/` under app storage (external if available, else internal)
 * - Initializes [ArtifactManager] with that directory
 * - Wires a [CombinedLogger] with [SummarySink] and [JsonSink] file targets
 *
 * Fault tolerance:
 * - If external storage is unavailable or directory creation fails, falls back to internal storage.
 * - If sink setup or ArtifactManager init fails, returns a **no-op** logger so tests keep running.
 */
object LoggerFactory {

    /**
     * Create a [StepLogger] and initialize the artifacts root for this run.
     *
     * The method prefers external app storage, then falls back to internal storage, and finally to an internal fallback
     * directory if needed. If sink setup fails, a **no-op** logger is returned so tests continue to run.
     *
     * @param runId Optional run identifier used as the artifacts directory name (sanitized). Defaults to current epoch
     *   millis for uniqueness.
     * @param ctx Optional Android context; defaults to instrumentation target context via [InstrumentationRegistry].
     */
    fun create(
        runId: String = System.currentTimeMillis().toString(),
        ctx: Context? = null,
    ): StepLogger {
        val appCtx = ctx ?: InstrumentationRegistry.getInstrumentation().targetContext
        val safeRunId = runId.replace("""[^\w.\-]+""".toRegex(), "_")

        // Prefer external app storage so the artifacts can be pulled off the device without root.
        val candidates =
            listOfNotNull(
                runCatching { appCtx.getExternalFilesDir(null) }.getOrNull(),
                appCtx.filesDir,
            )
        val root =
            candidates
                .asSequence()
                .map { File(it, "artifacts/$safeRunId") }
                .firstOrNull { dir ->
                    runCatching { dir.exists() || dir.mkdirs() }
                        .onFailure { android.util.Log.w("LoggerFactory", "mkdirs failed: ${dir.absolutePath}", it) }
                        .getOrDefault(false)
                } ?: File(appCtx.filesDir, "artifacts/_fallback_$safeRunId").apply { mkdirs() }
        android.util.Log.i("LoggerFactory", "Artifacts root: ${root.absolutePath}")

        // Initialize artifact manager safely
        try {
            ArtifactManager.init(root)
        } catch (t: Throwable) {
            android.util.Log.w("LoggerFactory", "ArtifactManager init failed, using no-op logger: ${t.message}", t)
            return noOpLogger()
        }

        // Create sinks (best-effort; if file I/O fails, return a no-op logger)
        return try {
            val summary = SummarySink(File(root, "summary.log"))
            val json = JsonSink(File(root, "details.jsonl"))
            CombinedLogger(summary, json)
        } catch (t: Throwable) {
            android.util.Log.w("LoggerFactory", "Sink setup failed, using no-op logger: ${t.message}", t)
            noOpLogger()
        }
    }

    /** Writes nowhere; used when the artifact directory or the sinks could not be created. */
    private fun noOpLogger(): StepLogger = CombinedLogger(null, null)
}
