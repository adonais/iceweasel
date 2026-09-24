/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import android.os.SystemClock

/** How long a verb keeps trying, declared at the call site rather than hand-rolled in each verb. */
sealed class WaitPolicy {
    /** One look. What mozClick did, and the reason it threw on a screen that was still settling. */
    object Immediate : WaitPolicy()

    /**
     * Look until the deadline.
     *
     * [backoff] starts the retries fast and slows them to [interval], so a screen that settles in 80ms costs 80ms
     * rather than a full [interval] tick. The suite spends most of its time waiting for things that have already
     * happened, which is where the wall-clock goes.
     *
     * Turn it off when probing faster changes the answer rather than just finding it sooner: a list still being
     * populated passes through the expected count on its way to a larger one, so mozVerifyElementCount samples on a
     * fixed beat.
     */
    data class Poll(
        val timeout: Long = 5_000,
        val interval: Long = 500,
        val backoff: Boolean = true,
    ) : WaitPolicy() {
        init {
            require(timeout >= 0) { "Wait timeout cannot be negative" }
            require(interval > 0) { "Wait interval must be positive" }
        }

        fun next(current: Long): Long = if (backoff) minOf(current * 2, interval) else interval
    }
}

/** First retry gap. Small enough that a settled screen is noticed almost immediately. */
internal const val FIRST_INTERVAL = 25L

/** The gap to start a [WaitPolicy] on: its own interval when fixed, [FIRST_INTERVAL] when backing off. */
internal fun WaitPolicy.firstGap(): Long = if (this is WaitPolicy.Poll && !backoff) interval else FIRST_INTERVAL

internal enum class RecoveryStage {
    BEFORE_POLLING,
    AFTER_POLLING,
}

internal data class WaitOutcome<T>(
    val lastObservation: T,
    val attempts: Int,
    val elapsedMs: Long,
    val satisfied: Boolean,
    val terminal: Boolean,
    val timedOut: Boolean,
)

internal interface WaitRuntime {
    fun nowMillis(): Long

    fun sleep(millis: Long)
}

private object AndroidWaitRuntime : WaitRuntime {
    override fun nowMillis(): Long = SystemClock.uptimeMillis()

    override fun sleep(millis: Long) = SystemClock.sleep(millis)
}

internal fun <T> waitFor(
    policy: WaitPolicy,
    runtime: WaitRuntime = AndroidWaitRuntime,
    probe: () -> T,
    satisfied: (T) -> Boolean,
    terminal: (T) -> Boolean = { false },
    recover: (T, RecoveryStage) -> Boolean = { _, _ -> false },
): WaitOutcome<T> {
    val startedAt = runtime.nowMillis()
    val timeout = (policy as? WaitPolicy.Poll)?.timeout ?: 0
    val deadline = startedAt + timeout
    var attempts = 0

    fun observe(): T {
        attempts += 1
        return probe()
    }

    fun outcome(observation: T): WaitOutcome<T> {
        val isSatisfied = satisfied(observation)
        val isTerminal = !isSatisfied && terminal(observation)
        return WaitOutcome(
            lastObservation = observation,
            attempts = attempts,
            elapsedMs = runtime.nowMillis() - startedAt,
            satisfied = isSatisfied,
            terminal = isTerminal,
            timedOut = policy is WaitPolicy.Poll && !isSatisfied && !isTerminal,
        )
    }

    var observation = observe()
    var complete = satisfied(observation) || terminal(observation)

    if (!complete && recover(observation, RecoveryStage.BEFORE_POLLING)) {
        observation = observe()
        complete = satisfied(observation) || terminal(observation)
    }

    if (!complete && policy is WaitPolicy.Poll) {
        var gap = policy.firstGap()
        while (!complete) {
            val remaining = deadline - runtime.nowMillis()
            if (remaining <= 0) break
            runtime.sleep(minOf(gap, remaining))
            observation = observe()
            complete = satisfied(observation) || terminal(observation)
            gap = policy.next(gap)
        }
    }

    if (!complete && recover(observation, RecoveryStage.AFTER_POLLING)) {
        observation = observe()
    }
    return outcome(observation)
}

internal fun WaitPolicy.timeoutMs(): Long = (this as? WaitPolicy.Poll)?.timeout ?: 0

internal fun <T> WaitOutcome<T>.facts(
    policy: WaitPolicy,
    lastObservation: String,
    timedOut: Boolean = this.timedOut,
): Map<String, Any?> =
    mapOf(
        "waitPolicy" to if (policy is WaitPolicy.Poll) "poll" else "immediate",
        "timeoutMs" to policy.timeoutMs(),
        "attempts" to attempts,
        "elapsedMs" to elapsedMs,
        "timedOut" to timedOut,
        "lastObservation" to lastObservation,
    )
