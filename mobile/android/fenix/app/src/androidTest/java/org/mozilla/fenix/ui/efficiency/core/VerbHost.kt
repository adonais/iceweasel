/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfile
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter

/**
 * What the verb executor needs from its host. BasePage supplies these six; the executor knows nothing about pages,
 * navigation or Compose rules, which is what lets the verbs live outside it.
 */
interface VerbHost {
    fun reporter(): TimedReporter

    fun locate(selector: Selector, applyPreconditions: Boolean): ElementResolution

    /** Null when the selector's strategy cannot match more than one element. */
    fun locateAll(selector: Selector): SemanticsNodeInteractionCollection?

    /** True if a blocking overlay was found and a dismiss attempted, so the caller re-probes. */
    fun dismissOverlays(): Boolean

    fun dumpFailure(label: String)

    fun stepId(prefix: String, description: String): String

    fun contextFacts(): Map<String, Any?> = emptyMap()
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

    /** An optional target was confirmed gone after its action reported a failure. */
    const val DISAPPEARED_DURING_ACTION = "disappeared_during_action"

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

    /** A condition with no selector behind it threw instead of answering true or false. */
    const val CONDITION_ERROR = "condition_error"

    /** A page's required elements were not all on screen. */
    const val NOT_ARRIVED = "not_arrived"

    /** A selector or page-identity group declared no observable elements. */
    const val EMPTY_SELECTOR_GROUP = "empty_selector_group"

    /** No readiness rule applies to the requested page and profile. */
    const val EMPTY_READINESS_CONTRACT = "empty_readiness_contract"

    /** The selector resolver threw instead of answering found or absent. */
    const val RESOLUTION_ERROR = "resolution_error"

    /** The element resolved, but evaluating the requested state threw. */
    const val PREDICATE_ERROR = "predicate_error"

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
        it.id?.let { id -> put("selectorId", id.value) }
        put("strategy", it.strategy.name)
        put("value", it.value)
        STRATEGY_LOCATORS[it.strategy]?.let { locator ->
            put("backend", locator.layer.name)
            if (locator.layer == Layer.COMPOSE) put("tree", locator.tree.name)
        }
        val roles = buildList {
            if (PageReadinessProfile.IDENTIFIED in it.readiness) add("identity_anchor")
            if (
                PageReadinessProfile.NAVIGATION_READY in it.readiness ||
                    PageReadinessProfile.INTERACTIVE in it.readiness
            ) {
                add("ready_content")
            }
        }
        if (roles.isNotEmpty()) put("semanticRoles", roles)
    }
    failure?.let {
        put("failure", it)
        put("failureCategory", Failure.category(it))
    }
    expectation?.let { put("expectation", it) }
    putAll(extra)
}

private fun Failure.category(failure: String): String =
    when (failure) {
        Failure.UNSUPPORTED_STRATEGY -> "inapplicable"
        Failure.RESOLUTION_ERROR -> "infrastructure"
        Failure.CONDITION_TIMEOUT -> "timeout"
        Failure.EMPTY_SELECTOR_GROUP,
        Failure.EMPTY_READINESS_CONTRACT,
        Failure.PREDICATE_ERROR,
        Failure.CONDITION_ERROR,
        Failure.ACTION_FAILED,
        Failure.NO_PATH -> "harness"
        else -> "assertion"
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
