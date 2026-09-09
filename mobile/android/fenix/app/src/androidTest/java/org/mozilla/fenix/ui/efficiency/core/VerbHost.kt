/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter

/**
 * What the verb executor needs from its host. BasePage supplies these six; the executor knows nothing about pages,
 * navigation or Compose rules, which is what lets the verbs live outside it.
 */
interface VerbHost {
    fun reporter(): TimedReporter

    fun locate(selector: Selector, applyPreconditions: Boolean): Any?

    /** Null when the selector's strategy cannot match more than one element. */
    fun locateAll(selector: Selector): SemanticsNodeInteractionCollection?

    /** True if a blocking overlay was found and a dismiss attempted, so the caller re-probes. */
    fun dismissOverlays(): Boolean

    fun dumpFailure(label: String)

    fun stepId(prefix: String, description: String): String
}

/**
 * How a verb failed, as a value rather than a sentence.
 *
 * Triage keys off these. The prose beside them is for a human and may be reworded at any time; these may not be, and a
 * rule that matches one keeps working when the wording changes.
 */
object Failure {
    /** The selector resolved to nothing. */
    const val NOT_FOUND = "not_found"

    /** Resolved, but the thing asked of it was false - not enabled, not selected, wrong text. */
    const val WRONG_STATE = "wrong_state"

    /** Resolved and satisfied the check, then the action itself threw. */
    const val ACTION_FAILED = "action_failed"

    /** An absence assertion: it was supposed to go away and did not. */
    const val STILL_PRESENT = "still_present"

    /** An absence assertion: it was supposed to stay away and appeared. */
    const val APPEARED = "appeared"

    /** Repeating an action never produced the screen the caller wanted. */
    const val NEVER_SETTLED = "never_settled"

    /** Nothing on screen matched, across every match for the selector. */
    const val COLLECTION_UNSATISFIED = "collection_unsatisfied"

    /** The selector's strategy cannot express the question that was asked of it. */
    const val UNSUPPORTED_STRATEGY = "unsupported_strategy"

    /** A condition with no selector behind it never became true. */
    const val CONDITION_TIMEOUT = "condition_timeout"

    /** A page's required elements were not all on screen. */
    const val NOT_ARRIVED = "not_arrived"

    /** No registered edge connects where you are to where you asked to go. */
    const val NO_PATH = "no_path"
}

/** The structured facts about one verb, recorded alongside its prose. */
fun facts(
    verb: String,
    selector: Selector? = null,
    failure: String? = null,
    expectation: String? = null,
    extra: Map<String, Any?> = emptyMap(),
): Map<String, Any?> = buildMap {
    put("verb", verb)
    selector?.let {
        put("selector", it.description)
        put("strategy", it.strategy.name)
        put("value", it.value)
    }
    failure?.let { put("failure", it) }
    expectation?.let { put("expectation", it) }
    putAll(extra)
}

/** Open the CMD scope a verb reports under. */
internal fun VerbHost.cmd(verb: String, description: String, announce: String) =
    reporter().start(TimedReporter.Type.CMD, stepId(verb, description), announce)

/** Open the LOC scope one lookup reports under. Every lookup announces itself the same way. */
internal fun VerbHost.loc(description: String, suffix: String = "") =
    reporter()
        .start(
            TimedReporter.Type.LOC,
            stepId("loc", description + suffix),
            "Attempting to locate '$description'...",
        )
