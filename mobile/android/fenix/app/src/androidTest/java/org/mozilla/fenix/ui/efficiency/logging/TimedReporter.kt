/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

/**
 * The structured narrative of what a test did: STEP (intent) -> CMD (a verb) -> LOC (one lookup), each timed, each
 * marked when it runs slow, and forwarded to the artifact sinks.
 *
 * This stream is a consumed interface, not a debug aid. effpretty renders it and effverify grades runs from it, so the
 * tags, the glyphs and the indentation in [ConsoleLogger] are a contract - and logging must never fail a test, so
 * nothing in here throws.
 *
 * ### Scopes, not a stack
 *
 * [start] hands back a [Scope] and you close that scope. The alternative - a stack, with `endCmd()` closing whatever is
 * on top - cannot tell a mismatched close from a correct one: a verb that threw between start and end left its event on
 * the stack, and the next `endCmd()` silently closed the wrong event, shifting the indentation of everything after it.
 * A scope you hold cannot be confused with one you do not, and an abandoned scope corrupts nothing.
 */
class TimedReporter(
    private val forwarder: StepLogger? = null,
    private val enabled: Boolean = true,
) {

    /**
     * The three levels of the narrative, and everything that differs between them: how deep they sit, how they announce
     * themselves, when they count as slow, and what to call them in a summary. Table rather than four `when` blocks
     * over the same three cases.
     */
    enum class Type(
        val defaultLevel: Int,
        val slowMs: Long,
        val label: String,
        internal val announce: (Int, String) -> Unit,
    ) {
        /** Highest-level intent: "navigate to BookmarksPage". */
        STEP(0, 1_500, "Steps", ConsoleLogger::step),

        /** One verb: "click menu item", "verify page loads". */
        CMD(1, 800, "Commands", ConsoleLogger::cmd),

        /** One element lookup. */
        LOC(2, 250, "Locators", ConsoleLogger::loc),
    }

    /** How a scope ended: which line it writes, which counter it bumps, what the sinks are told. */
    private enum class Outcome(
        val announce: (Int, String) -> Unit,
        val result: (String, Throwable?) -> StepResult,
    ) {
        OK(ConsoleLogger::ok, { _, _ -> StepResult.Ok }),
        FAIL(ConsoleLogger::err, { reason, cause -> StepResult.Fail(reason, cause) }),
        SKIP(ConsoleLogger::skip, { _, _ -> StepResult.Ok }),
    }

    /**
     * One open scope. Close it exactly once, with the outcome; a second close is ignored rather than double-counted.
     */
    inner class Scope
    internal constructor(
        private val id: String,
        private val name: String,
        private val type: Type,
        private val level: Int,
        private val startNs: Long,
    ) {
        private var closed = false

        fun ok(message: String = "", facts: Map<String, Any?> = emptyMap()) = finish(Outcome.OK, message, facts)

        fun fail(message: String = "", cause: Throwable? = null, facts: Map<String, Any?> = emptyMap()) =
            finish(Outcome.FAIL, message, facts, cause)

        fun skip(message: String = "", facts: Map<String, Any?> = emptyMap()) = finish(Outcome.SKIP, message, facts)

        /** `ok(...)` or `fail(...)` on a boolean, which is what most verbs actually have. */
        fun done(success: Boolean, message: String = "", facts: Map<String, Any?> = emptyMap()) =
            if (success) ok(message, facts) else fail(message, facts = facts)

        /** The LOC completion every lookup writes. */
        fun found(description: String, present: Boolean, facts: Map<String, Any?> = emptyMap()) =
            done(present, if (present) "'$description' found" else "'$description' not found", facts)

        private fun finish(
            outcome: Outcome,
            message: String,
            facts: Map<String, Any?> = emptyMap(),
            cause: Throwable? = null,
        ) {
            if (closed || !enabled) return
            closed = true

            val elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0
            val msText = "%.1f".format(elapsedMs)
            // SKIP is not an outcome you can be slow at, and it always carries its own message.
            val text =
                if (outcome == Outcome.SKIP) {
                    "$message ($msText ms)"
                } else {
                    val fallback = if (outcome == Outcome.OK) "OK" else "FAILED"
                    val suffix = if (elapsedMs >= type.slowMs) " ⚠️ SLOW ($msText ms)" else " ($msText ms)"
                    (message.takeIf { it.isNotBlank() } ?: fallback) + suffix
                }
            outcome.announce(level, text)

            counts[outcome] = (counts[outcome] ?: 0) + 1
            elapsed[type] = (elapsed[type] ?: 0.0) + elapsedMs

            // The console line is prose for a human; these fields are the same event for a machine.
            // Triage rules that regex the prose break silently whenever the wording is reworded -
            // which is how eight of efftriage's rules died in one afternoon.
            val args =
                facts +
                    mapOf(
                        "type" to type.name,
                        "outcome" to outcome.name,
                        "elapsedMs" to elapsedMs,
                    )
            forwarder?.stepEnd(StepDescriptor(id, name, args), outcome.result(message, cause))
        }
    }

    private val starts = mutableMapOf<Type, Int>()
    private val counts = mutableMapOf<Outcome, Int>()
    private val elapsed = mutableMapOf<Type, Double>()
    private var wallStartNs = System.nanoTime()

    /**
     * Open a scope, announcing it. The caller holds the result and closes it.
     *
     * LOC events are forwarded to the file sinks as well as the console. That is chatty on purpose while selector
     * behaviour is still being learned; sampling or aggregating them into one record per command is the obvious change
     * once it is not.
     */
    fun start(type: Type, id: String, name: String, level: Int = type.defaultLevel): Scope {
        if (enabled) {
            type.announce(level, name)
            forwarder?.stepStart(StepDescriptor(id, name, mapOf("type" to type.name)))
            starts[type] = (starts[type] ?: 0) + 1
        }
        return Scope(id, name, type, level, System.nanoTime())
    }

    /**
     * Test boundaries, for the artifact only. The console already gets these from the TestRunner tag, and duplicating
     * them there would change a stream that effpretty and effverify parse; the JSONL has no other way to know which
     * test a step belongs to.
     */
    fun testStart(testId: String, meta: Map<String, Any?> = emptyMap()) {
        if (enabled) forwarder?.testStart(testId, meta)
    }

    fun testEnd(testId: String, status: TestStatus) {
        if (enabled) forwarder?.testEnd(testId, status)
    }

    /**
     * A structured event that is not a scope: a screen dump, a captured artifact. Goes to the record only - whatever
     * produced it has already said its piece on the console, and repeating it there would bury the narrative.
     */
    fun record(type: String, fields: Map<String, Any?>) {
        if (enabled) forwarder?.record(type, fields)
    }

    /**
     * Clear counters between tests. Parameterized tests and retries reuse the same reporter, so without this a summary
     * describes every run so far rather than this one.
     */
    fun reset() {
        starts.clear()
        counts.clear()
        elapsed.clear()
        wallStartNs = System.nanoTime()
    }

    /**
     * Wall time against the sum of measured scopes. If the STEP total is close to wall time, the top-level step wrapped
     * nearly all the work; if wall time is much larger, uninstrumented work (setup, teardown, sleeps) is dominating.
     */
    fun printSummary() {
        ConsoleLogger.info(0, "=== TEST SUMMARY ===")
        for (type in Type.entries) {
            val n = starts[type] ?: 0
            val ms = elapsed[type] ?: 0.0
            val avg = ms / (if (n == 0) 1 else n)
            ConsoleLogger.info(1, "${type.label}: $n (total ${"%.1f".format(ms)} ms, avg ${"%.1f".format(avg)} ms)")
        }
        ConsoleLogger.info(
            1,
            "Successes: ${counts[Outcome.OK] ?: 0}   " +
                "Failures: ${counts[Outcome.FAIL] ?: 0}   " +
                "Skips: ${counts[Outcome.SKIP] ?: 0}",
        )
        ConsoleLogger.info(1, "Wall time: ${"%.1f".format((System.nanoTime() - wallStartNs) / 1_000_000.0)} ms")
    }

    companion object {
        /** For code that runs outside a test - the inspector, tooling - where there is nothing to narrate. */
        val Silent = TimedReporter(enabled = false)
    }
}
