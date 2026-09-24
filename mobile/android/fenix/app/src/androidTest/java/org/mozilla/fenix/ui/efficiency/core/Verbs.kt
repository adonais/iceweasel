/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import android.os.SystemClock
import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessContext
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessContract
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessEvaluation
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter

/**
 * The shapes every element verb has. Each announces the command, resolves, retries once if a known overlay was covering
 * the target, reports, dumps the screen and throws with the selector named - so no verb has to, and no two verbs can
 * disagree about it.
 *
 * Every verb reports, because the structured log stream is the source of truth for what a test actually did - it is
 * what effpretty renders and what effverify grades, so the shape of what is emitted here is a consumed interface, not
 * an implementation detail.
 *
 * Seven shapes:
 *
 * - [require] one element must satisfy something; then act on it
 * - [requireAbsent] one element must not be there, now or for a while
 * - [requireAll] something must hold across every match for a selector
 * - [driveUntil] repeat an action until the screen changes the way you want
 * - [groupPresent] are all of a group's selectors on screen? answered, not thrown
 * - [requireState] poll a condition that has no selector behind it
 * - [reportAround] put the reporting around a call that throws on its own
 *
 * A verb is now a name, a policy, a predicate and an action. Each returns its receiver, so a page-object verb is a
 * single expression rather than a block ending in `return this`.
 */

/**
 * Resolve [selector], satisfy [predicate], then run [action]. Throws AssertionError naming the selector if it cannot,
 * having dumped the screen first.
 *
 * @return the receiver
 */
fun <T : VerbHost> T.require(
    verb: String,
    selector: Selector,
    expectation: String = "present",
    policy: WaitPolicy = WaitPolicy.Immediate,
    applyPreconditions: Boolean = true,
    dumpOnFailure: Boolean = true,
    optional: Boolean = false,
    via: ((Selector, Boolean) -> ElementResolution)? = null,
    predicate: (UiElement) -> Boolean = { true },
    action: (UiElement) -> Unit = {},
): T {
    val cmd = cmd(verb, selector.description, "Attempting to $verb '${selector.description}'...")

    val probe = seek(selector, policy, applyPreconditions, predicate, via)
    val waitFacts = probe.wait.facts(policy, probe.last.summary())
    val element = probe.matched
    if (element == null) {
        probe.last.problem(selector)?.let {
            failLookup(cmd, verb, selector, expectation, dumpOnFailure, it, waitFacts)
        }
        if (optional && probe.located == null) {
            cmd.skip(
                "'${selector.description}' not present; skipped",
                verbFacts(verb, selector, Failure.NOT_FOUND, extra = waitFacts),
            )
            return this
        }
        // Keep "not on screen" and "on screen but wrong state" distinguishable. The verbs this
        // replaced threw two different errors for the two cases, and collapsing them into one
        // predicate would have made every state failure read as a missing element.
        val notFound = probe.located == null
        val message =
            if (notFound) {
                "'${selector.description}' not found"
            } else {
                "'${selector.description}' was found but $expectation was false"
            }
        cmd.fail(
            message,
            facts =
                verbFacts(
                    verb,
                    selector,
                    if (notFound) Failure.NOT_FOUND else Failure.WRONG_STATE,
                    expectation,
                    waitFacts + dumpRef(dumpOnFailure, verb, selector),
                ),
        )
        if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
        throw AssertionError("$message (${selector.strategy} -> ${selector.value})")
    }

    try {
        action(element)
        cmd.ok("$verb '${selector.description}' ok", verbFacts(verb, selector, extra = waitFacts))
        return this
    } catch (e: Throwable) {
        if (optional) {
            val afterFailure =
                observe(
                    selector,
                    applyPreconditions = false,
                    suffix = "_after_action_failure",
                    predicate = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
                    via = via,
                )
            if (afterFailure.problem(selector) == null && afterFailure.matched == null) {
                cmd.skip(
                    "'${selector.description}' disappeared during $verb; skipped",
                    verbFacts(
                        verb,
                        selector,
                        Failure.DISAPPEARED_DURING_ACTION,
                        extra = waitFacts + mapOf("actionThrowableType" to e::class.java.name),
                    ),
                )
                return this
            }
        }
        cmd.fail(
            "$verb '${selector.description}' failed: ${e.message ?: "exception"}",
            cause = e,
            facts =
                verbFacts(
                    verb,
                    selector,
                    Failure.ACTION_FAILED,
                    expectation,
                    waitFacts + dumpRef(dumpOnFailure, verb, selector),
                ),
        )
        if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
        throw e
    }
}

/**
 * The inverse of [require]: assert [selector] is *not* on screen - now, or for the whole window.
 *
 * @return the receiver
 */
fun <T : VerbHost> T.requireAbsent(
    verb: String,
    selector: Selector,
    policy: WaitPolicy = WaitPolicy.Immediate,
    sustain: Boolean = false,
    dumpOnFailure: Boolean = false,
): T {
    val cmd = cmd(verb, selector.description, "Verifying '${selector.description}' is absent...")

    fun present(): Observation =
        observe(
            selector,
            false,
            predicate = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
        )

    val wait =
        waitFor(
            policy = policy,
            probe = ::present,
            satisfied = { observation -> (observation.matched != null) == sustain },
            terminal = { it.problem(selector)?.retryable == false },
        )
    wait.lastObservation.problem(selector)?.let {
        failLookup(
            cmd,
            verb,
            selector,
            "absent",
            dumpOnFailure,
            it,
            wait.facts(policy, wait.lastObservation.summary()),
        )
    }
    val appeared = wait.lastObservation.matched != null
    val waitFacts =
        wait.facts(policy, wait.lastObservation.summary(), timedOut = !sustain && wait.timedOut) +
            if (sustain) mapOf("observationWindowCompleted" to !appeared) else emptyMap()
    val timeout = policy.timeoutMs()

    if (appeared) {
        val message =
            when {
                sustain -> "'${selector.description}' was expected to stay absent but appeared within ${timeout}ms"
                timeout > 0 ->
                    "'${selector.description}' was expected to disappear but is still visible after ${timeout}ms"
                else -> "'${selector.description}' was expected to be absent but is visible"
            }
        cmd.fail(
            message,
            facts =
                verbFacts(
                    verb,
                    selector,
                    if (sustain) Failure.APPEARED else Failure.STILL_PRESENT,
                    extra = waitFacts + dumpRef(dumpOnFailure, verb, selector),
                ),
        )
        if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
        throw AssertionError(message)
    }
    cmd.ok("'${selector.description}' absent", verbFacts(verb, selector, extra = waitFacts))
    return this
}

/**
 * Assert something about *all* the matches for a selector, rather than one of them.
 *
 * Only a Compose tag selector can produce a collection, which is the one fact worth reporting when a caller picks
 * another strategy.
 *
 * @return the receiver
 */
fun <T : VerbHost> T.requireAll(
    verb: String,
    selector: Selector,
    expectation: String,
    policy: WaitPolicy = WaitPolicy.Immediate,
    dumpOnFailure: Boolean = false,
    before: () -> Unit = {},
    satisfied: (SemanticsNodeInteractionCollection) -> Boolean,
    action: (SemanticsNodeInteractionCollection) -> Unit = {},
): T {
    val cmd = cmd(verb, selector.description, "Verifying '${selector.description}' $expectation...")
    before()

    val wait =
        waitFor(
            policy = policy,
            probe = {
                val all = locateAll(selector)
                val evaluation = all?.let { runCatching { satisfied(it) } }
                CollectionObservation(
                    collection = all,
                    satisfied = evaluation?.getOrDefault(false) == true,
                    error = evaluation?.exceptionOrNull(),
                )
            },
            satisfied = { it.satisfied },
            terminal = { it.collection == null || it.error != null },
        )
    val waitFacts = wait.facts(policy, wait.lastObservation.summary())
    val all = wait.lastObservation.collection
    if (all == null) {
        failUnsupportedCollection(cmd, verb, selector, expectation, waitFacts)
    }
    wait.lastObservation.error?.let { error ->
        failCollectionPredicate(cmd, verb, selector, expectation, waitFacts, error)
    }
    if (wait.satisfied) {
        // Outside the runCatching above: a failing action is a real error to propagate, not a
        // "the expectation was false".
        action(all)
        cmd.ok(
            "'${selector.description}' $expectation",
            verbFacts(verb, selector, expectation = expectation, extra = waitFacts),
        )
        return this
    }

    val timeout = policy.timeoutMs()
    val message = "'${selector.description}' $expectation was false" + if (timeout > 0) " after ${timeout}ms" else ""
    cmd.fail(
        message,
        facts =
            verbFacts(
                verb,
                selector,
                Failure.COLLECTION_UNSATISFIED,
                expectation,
                waitFacts + dumpRef(dumpOnFailure, verb, selector),
            ),
    )
    if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
    throw AssertionError(message)
}

/**
 * Do [step] up to [attempts] times until [selector]'s presence matches [want].
 *
 * Checks first, acts second: if the screen is already how the caller wants it, nothing happens.
 *
 * @return the receiver
 */
fun <T : VerbHost> T.driveUntil(
    verb: String,
    selector: Selector,
    attempts: Int,
    want: Boolean,
    dumpOnFailure: Boolean = false,
    probe: (UiElement) -> Boolean = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
    settle: () -> Unit = {},
    step: () -> Unit,
): T {
    val goal = if (want) "present" else "gone"
    val cmd = cmd(verb, selector.description, "$verb until '${selector.description}' is $goal...")
    val startedAt = SystemClock.uptimeMillis()

    fun observeAttempt(attempt: Int): Observation {
        val observation = observe(selector, false, "_attempt_$attempt", probe)
        observation.problem(selector)?.let {
            failLookup(
                cmd,
                verb,
                selector,
                goal,
                dumpOnFailure,
                it,
                actionWaitFacts(attempt, startedAt, observation.summary()),
            )
        }
        return observation
    }

    var lastObservation: Observation? = null
    for (attempt in 0..attempts) {
        val observation = observeAttempt(attempt + 1)
        lastObservation = observation
        val matches = (observation.matched != null) == want
        if (matches) {
            cmd.ok(
                "'${selector.description}' $goal after $attempt $verb(s)",
                verbFacts(
                    verb,
                    selector,
                    extra = actionWaitFacts(attempt + 1, startedAt, observation.summary(), attempt),
                ),
            )
            return this
        }
        if (attempt == attempts) break
        step()
        settle()
    }

    val message = "'${selector.description}' still not $goal after $attempts $verb(s)"
    cmd.fail(
        message,
        facts =
            verbFacts(
                verb,
                selector,
                // "it never went away" and "it never showed up" are the same loop but not the same bug.
                if (want) Failure.NEVER_SETTLED else Failure.STILL_PRESENT,
                expectation = goal,
                extra =
                    actionWaitFacts(
                        attempts + 1,
                        startedAt,
                        lastObservation?.summary() ?: "not_observed",
                        attempts,
                    ) + dumpRef(dumpOnFailure, verb, selector),
            ),
    )
    if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
    throw AssertionError(message)
}

/**
 * Poll a condition with no selector behind it - the soft keyboard being up, a foreign package coming to the
 * foreground - with the same reporting and failure shape as the selector verbs.
 */
fun <T : VerbHost> T.requireState(
    verb: String,
    description: String,
    policy: WaitPolicy = WaitPolicy.Immediate,
    dumpOnFailure: Boolean = false,
    condition: () -> Boolean,
): T {
    val cmd = reporter().start(TimedReporter.Type.CMD, verb, "Verifying $description...")

    val wait =
        waitFor(
            policy = policy,
            probe = {
                runCatching { condition() }
                    .fold(
                        onSuccess = { ConditionObservation(it) },
                        onFailure = { ConditionObservation(false, it) },
                    )
            },
            satisfied = { it.satisfied },
            terminal = { it.error != null },
        )
    val waitFacts = wait.facts(policy, wait.lastObservation.summary())
    wait.lastObservation.error?.let { error ->
        val message = "$description failed: ${error.message ?: "exception"}"
        cmd.fail(
            message,
            cause = error,
            facts =
                verbFacts(
                    verb,
                    failure = Failure.CONDITION_ERROR,
                    expectation = description,
                    extra = waitFacts + mapOf("failurePhase" to "condition"),
                ),
        )
        if (dumpOnFailure) dumpFailure(verb)
        throw error
    }
    if (wait.satisfied) {
        cmd.ok("$description: yes", verbFacts(verb, extra = waitFacts))
        return this
    }

    val timeout = policy.timeoutMs()
    val message = if (timeout > 0) "$description: no, after ${timeout}ms" else "$description: no"
    cmd.fail(
        message,
        facts = verbFacts(verb, failure = Failure.CONDITION_TIMEOUT, expectation = description, extra = waitFacts),
    )
    if (dumpOnFailure) dumpFailure(verb)
    throw AssertionError(message)
}

/**
 * Report around a [block] that already throws for itself.
 *
 * For the verbs that delegate to something else - a slider's semantics action, the notification shade,
 * AppAndSystemHelper's external-app assertions - where there is nothing to resolve and nothing to poll, only a call
 * whose failure should reach the report before it reaches the test.
 */
fun <T : VerbHost> T.reportAround(
    verb: String,
    description: String,
    dumpOnFailure: Boolean = false,
    block: () -> Unit,
): T {
    val cmd = cmd(verb, description, "$description...")
    try {
        block()
        cmd.ok("$description: done", verbFacts(verb))
        return this
    } catch (e: Throwable) {
        cmd.fail(
            "$description failed: ${e.message ?: "exception"}",
            cause = e,
            facts = verbFacts(verb, failure = Failure.ACTION_FAILED, expectation = description),
        )
        if (dumpOnFailure) dumpFailure("$verb failed: $description")
        throw e
    }
}

/**
 * Are all of [selectors] on screen? Reports each one, answers rather than throwing. One command in the report however
 * long the wait, not one per tick.
 *
 * @return true when every selector is present before the policy expires
 */
fun VerbHost.groupPresent(
    verb: String,
    label: String,
    selectors: List<Selector>,
    policy: WaitPolicy = WaitPolicy.Immediate,
    applyPreconditions: Boolean = false,
    whenPresent: String = "'$label' present",
): Boolean {
    val cmd = cmd(verb, label, "Checking '$label'...")
    if (selectors.isEmpty()) {
        cmd.fail(
            "'$label' has no selectors",
            facts = verbFacts(verb, failure = Failure.EMPTY_SELECTOR_GROUP, extra = mapOf("group" to label)),
        )
        return false
    }

    fun observeGroup(): GroupObservation {
        var lastRetryableProblem: Pair<Selector, LookupProblem>? = null
        var allPresent = true
        selectors.forEach { sel ->
            val observation =
                observe(
                    sel,
                    applyPreconditions,
                    "_in_$label",
                    predicate = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
                )
            observation.problem(sel)?.let { problem ->
                lastRetryableProblem = sel to problem
            }
            if (observation.matched == null) allPresent = false
        }
        return GroupObservation(allPresent, lastRetryableProblem)
    }

    val wait =
        waitFor(
            policy = policy,
            probe = ::observeGroup,
            satisfied = { it.present },
            terminal = { it.retryableProblem?.second?.retryable == false },
            recover = { observation, stage ->
                when (stage) {
                    RecoveryStage.BEFORE_POLLING -> observation.retryableProblem != null && dismissOverlays()
                    RecoveryStage.AFTER_POLLING -> dismissOverlays()
                }
            },
        )
    val here = wait.satisfied
    if (!here && (policy is WaitPolicy.Poll || wait.terminal)) {
        wait.lastObservation.retryableProblem?.let { (selector, problem) ->
            failLookup(
                cmd,
                verb,
                selector,
                "present",
                dumpOnFailure = false,
                problem,
                wait.facts(policy, wait.lastObservation.summary()),
            )
        }
    }

    cmd.done(
        here,
        if (here) whenPresent else "'$label' not present",
        verbFacts(
            verb,
            failure = if (here) null else Failure.NOT_ARRIVED,
            extra = mapOf("page" to label) + wait.facts(policy, wait.lastObservation.summary()),
        ),
    )
    return here
}

fun VerbHost.pageReady(
    contract: PageReadinessContract,
    context: PageReadinessContext,
    policy: WaitPolicy,
): PageReadinessEvaluation {
    val profile = context.profile.name.lowercase()
    val label = "${context.page}_$profile"
    val cmd = cmd("page_readiness", label, "Checking '$label'...")
    fun evaluate(): ReadinessObservation {
        var lastRetryableProblem: Pair<Selector, LookupProblem>? = null
        val evaluation =
            contract.evaluate(context) { selector ->
                val observation =
                    observe(
                        selector,
                        applyPreconditions = false,
                        suffix = "_in_$label",
                        predicate = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
                    )
                observation.problem(selector)?.let { problem ->
                    lastRetryableProblem = selector to problem
                }
                observation.matched != null
            }
        return ReadinessObservation(evaluation, lastRetryableProblem)
    }

    val wait =
        waitFor(
            policy = policy,
            probe = ::evaluate,
            satisfied = { it.evaluation.satisfied },
            terminal = {
                !it.evaluation.hasContract || it.retryableProblem?.second?.retryable == false
            },
            recover = { _, _ -> dismissOverlays() },
        )
    val evaluation = wait.lastObservation.evaluation
    if (!evaluation.satisfied && (policy is WaitPolicy.Poll || wait.terminal)) {
        wait.lastObservation.retryableProblem?.let { (selector, problem) ->
            failLookup(
                cmd,
                "page_readiness",
                selector,
                "present",
                dumpOnFailure = false,
                problem,
                wait.facts(policy, wait.lastObservation.summary()),
            )
        }
    }

    val failure =
        when {
            evaluation.satisfied -> null
            evaluation.predicateFailures.isNotEmpty() -> Failure.PREDICATE_ERROR
            !evaluation.hasContract -> Failure.EMPTY_READINESS_CONTRACT
            else -> Failure.NOT_ARRIVED
        }
    cmd.done(
        evaluation.satisfied,
        if (evaluation.satisfied) "'$label' ready" else "'$label' not ready",
        verbFacts(
            verb = "page_readiness",
            failure = failure,
            extra =
                mapOf(
                    "page" to context.page,
                    "readinessProfile" to context.profile.name,
                    "navigationFacts" to context.navigationState.facts.map { it.name }.sorted(),
                    "incomingRoute" to context.incomingEdge?.id,
                    "outgoingRoute" to context.outgoingEdge?.id,
                    "isWaypoint" to context.isWaypoint,
                    "isDestination" to context.isDestination,
                    "appliedRules" to evaluation.appliedRules,
                    "skippedRules" to evaluation.skippedRules,
                    "missingSelectors" to evaluation.missingSelectors,
                    "predicateFailures" to evaluation.predicateFailures,
                ) + wait.facts(policy, wait.lastObservation.summary()),
        ),
    )
    return evaluation
}

/**
 * Which screen dump belongs to this failure. [dumpFailure] labels its output; recording the same label here is what
 * lets a consumer pair the two up, since the dump goes to logcat under its own tag and carries no step id of its own.
 */
private fun dumpRef(dumping: Boolean, verb: String, selector: Selector): Map<String, Any?> =
    if (dumping) mapOf("dump" to "$verb failed: ${selector.description}") else emptyMap()

private fun VerbHost.failUnsupportedCollection(
    scope: TimedReporter.Scope,
    verb: String,
    selector: Selector,
    expectation: String,
    waitFacts: Map<String, Any?>,
): Nothing {
    val message = "${selector.strategy} cannot match more than one element; $verb needs a Compose tag selector"
    scope.fail(
        message,
        facts = verbFacts(verb, selector, Failure.UNSUPPORTED_STRATEGY, expectation, waitFacts),
    )
    throw AssertionError(message)
}

private fun VerbHost.failCollectionPredicate(
    scope: TimedReporter.Scope,
    verb: String,
    selector: Selector,
    expectation: String,
    waitFacts: Map<String, Any?>,
    error: Throwable,
): Nothing {
    val message = "'${selector.description}' predicate failed: ${error.message ?: "exception"}"
    scope.fail(
        message,
        cause = error,
        facts =
            verbFacts(
                verb,
                selector,
                Failure.PREDICATE_ERROR,
                expectation,
                waitFacts + mapOf("failurePhase" to "predicate"),
            ),
    )
    throw error
}

private fun actionWaitFacts(
    attempts: Int,
    startedAt: Long,
    lastObservation: String,
    actionAttempts: Int = 0,
): Map<String, Any?> =
    mapOf(
        "waitPolicy" to "action_bounded",
        "attempts" to attempts,
        "actionAttempts" to actionAttempts,
        "elapsedMs" to SystemClock.uptimeMillis() - startedAt,
        "timedOut" to false,
        "lastObservation" to lastObservation,
    )

/**
 * What a lookup saw: [located] is the element if it resolved at all, [matched] only if it also satisfied the predicate.
 * Two fields rather than one nullable so a failure can say which happened.
 */
private class Probe(
    val located: UiElement? = null,
    val matched: UiElement? = null,
    val last: Observation,
    val wait: WaitOutcome<Observation>,
)

private data class CollectionObservation(
    val collection: SemanticsNodeInteractionCollection?,
    val satisfied: Boolean,
    val error: Throwable? = null,
) {
    fun summary(): String =
        when {
            collection == null -> "unsupported_collection"
            error != null -> "predicate_error"
            satisfied -> "satisfied"
            else -> "unsatisfied"
        }
}

private data class ConditionObservation(
    val satisfied: Boolean,
    val error: Throwable? = null,
) {
    fun summary(): String =
        when {
            error != null -> "condition_error"
            satisfied -> "satisfied"
            else -> "unsatisfied"
        }
}

private data class GroupObservation(
    val present: Boolean,
    val retryableProblem: Pair<Selector, LookupProblem>?,
) {
    fun summary(): String =
        when {
            present -> "present"
            retryableProblem != null -> retryableProblem.second.observation
            else -> "missing_selectors"
        }
}

private data class ReadinessObservation(
    val evaluation: PageReadinessEvaluation,
    val retryableProblem: Pair<Selector, LookupProblem>?,
) {
    fun summary(): String =
        when {
            evaluation.satisfied -> "ready"
            !evaluation.hasContract -> "empty_contract"
            retryableProblem != null -> retryableProblem.second.observation
            evaluation.predicateFailures.isNotEmpty() -> "readiness_predicate_failed"
            else -> "missing_selectors"
        }
}

private data class Observation(
    val resolution: ElementResolution,
    val matched: UiElement? = null,
    val phase: String = "resolve",
) {
    fun summary(): String =
        when (resolution) {
            is ElementResolution.Found -> if (matched != null) "matched" else "predicate_false"
            ElementResolution.Absent -> "absent"
            is ElementResolution.Unsupported -> "unsupported"
            is ElementResolution.Error ->
                when {
                    phase == "predicate" -> "predicate_error"
                    resolution.retryable -> "transient_error"
                    else -> "resolution_error"
                }
        }
}

private data class LookupProblem(
    val failure: String,
    val message: String,
    val cause: Throwable? = null,
    val phase: String,
    val retryable: Boolean = false,
) {
    val observation: String
        get() =
            when {
                retryable -> "transient_error"
                phase == "predicate" -> "predicate_error"
                failure == Failure.UNSUPPORTED_STRATEGY -> "unsupported"
                else -> "resolution_error"
            }
}

/**
 * The lookup itself: poll if asked, and give a covering overlay exactly one chance to be dismissed before declaring the
 * target absent.
 */
private fun VerbHost.seek(
    selector: Selector,
    policy: WaitPolicy,
    applyPreconditions: Boolean,
    predicate: (UiElement) -> Boolean,
    via: ((Selector, Boolean) -> ElementResolution)? = null,
): Probe {
    var seen: UiElement? = null

    fun once(): Observation {
        val observation = observe(selector, applyPreconditions, predicate = predicate, via = via)
        (observation.resolution as? ElementResolution.Found)?.element?.let { seen = it }
        return observation
    }

    val wait =
        waitFor(
            policy = policy,
            probe = ::once,
            satisfied = { it.matched != null },
            terminal = { it.problem(selector)?.let { problem -> !problem.retryable } == true },
            recover = { observation, stage ->
                val retryable = observation.problem(selector)?.retryable == true
                when (stage) {
                    RecoveryStage.BEFORE_POLLING -> retryable && dismissOverlays()
                    RecoveryStage.AFTER_POLLING -> dismissOverlays()
                }
            },
        )
    return Probe(seen, wait.lastObservation.matched, wait.lastObservation, wait)
}

private fun VerbHost.observe(
    selector: Selector,
    applyPreconditions: Boolean,
    suffix: String = "",
    predicate: (UiElement) -> Boolean,
    via: ((Selector, Boolean) -> ElementResolution)? = null,
): Observation {
    val loc = loc(selector.description, suffix)
    val resolution =
        try {
            via?.invoke(selector, applyPreconditions) ?: locate(selector, applyPreconditions)
        } catch (e: Throwable) {
            ElementResolution.Error(e)
        }
    return when (resolution) {
        is ElementResolution.Found ->
            try {
                if (predicate(resolution.element)) {
                    loc.found(
                        selector.description,
                        true,
                        verbFacts("locate", selector, extra = mapOf("resolution" to "found")),
                    )
                    Observation(resolution, resolution.element)
                } else {
                    loc.fail(
                        "'${selector.description}' found but predicate was false",
                        facts =
                            verbFacts(
                                "locate",
                                selector,
                                Failure.WRONG_STATE,
                                extra = mapOf("resolution" to "found"),
                            ),
                    )
                    Observation(resolution)
                }
            } catch (e: Throwable) {
                loc.fail(
                    "'${selector.description}' predicate failed: ${e.message ?: "exception"}",
                    cause = e,
                    facts =
                        verbFacts(
                            "locate",
                            selector,
                            Failure.PREDICATE_ERROR,
                            extra = mapOf("resolution" to "error", "failurePhase" to "predicate"),
                        ),
                )
                Observation(ElementResolution.Error(e), phase = "predicate")
            }
        ElementResolution.Absent -> {
            loc.found(
                selector.description,
                false,
                verbFacts("locate", selector, Failure.NOT_FOUND, extra = mapOf("resolution" to "absent")),
            )
            Observation(resolution)
        }
        is ElementResolution.Unsupported -> {
            loc.fail(
                "'${selector.description}' is unsupported: ${resolution.reason}",
                facts =
                    verbFacts(
                        "locate",
                        selector,
                        Failure.UNSUPPORTED_STRATEGY,
                        extra = mapOf("resolution" to "unsupported", "reason" to resolution.reason),
                    ),
            )
            Observation(resolution)
        }
        is ElementResolution.Error -> {
            val details =
                verbFacts(
                    "locate",
                    selector,
                    Failure.RESOLUTION_ERROR,
                    extra =
                        mapOf(
                            "resolution" to if (resolution.retryable) "transient_error" else "error",
                            "failurePhase" to "resolve",
                            "retryable" to resolution.retryable,
                        ),
                )
            if (resolution.retryable) {
                loc.found(selector.description, false, details)
            } else {
                loc.fail(
                    "'${selector.description}' resolution failed: ${resolution.cause.message ?: "exception"}",
                    cause = resolution.cause,
                    facts = details,
                )
            }
            Observation(resolution)
        }
    }
}

private fun Observation.problem(selector: Selector): LookupProblem? =
    when (val result = resolution) {
        is ElementResolution.Unsupported ->
            LookupProblem(
                Failure.UNSUPPORTED_STRATEGY,
                "'${selector.description}' is unsupported: ${result.reason}",
                phase = phase,
            )
        is ElementResolution.Error ->
            LookupProblem(
                if (phase == "predicate") Failure.PREDICATE_ERROR else Failure.RESOLUTION_ERROR,
                "'${selector.description}' $phase failed: ${result.cause.message ?: "exception"}",
                result.cause,
                phase,
                result.retryable,
            )
        else -> null
    }

private fun VerbHost.failLookup(
    scope: TimedReporter.Scope,
    verb: String,
    selector: Selector,
    expectation: String,
    dumpOnFailure: Boolean,
    problem: LookupProblem,
    extra: Map<String, Any?> = emptyMap(),
): Nothing {
    scope.fail(
        problem.message,
        cause = problem.cause,
        facts =
            verbFacts(
                verb,
                selector,
                problem.failure,
                expectation,
                extra + mapOf("failurePhase" to problem.phase) + dumpRef(dumpOnFailure, verb, selector),
            ),
    )
    if (dumpOnFailure) dumpFailure("$verb failed: ${selector.description}")
    problem.cause?.let { throw it }
    throw AssertionError(problem.message)
}

private fun VerbHost.verbFacts(
    verb: String,
    selector: Selector? = null,
    failure: String? = null,
    expectation: String? = null,
    extra: Map<String, Any?> = emptyMap(),
): Map<String, Any?> = facts(verb, selector, failure, expectation, contextFacts() + extra)
