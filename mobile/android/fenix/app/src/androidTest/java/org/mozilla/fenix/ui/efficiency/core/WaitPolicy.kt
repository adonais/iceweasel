/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

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
        fun next(current: Long): Long = if (backoff) minOf(current * 2, interval) else interval
    }
}

/** First retry gap. Small enough that a settled screen is noticed almost immediately. */
internal const val FIRST_INTERVAL = 25L

/** The gap to start a [WaitPolicy] on: its own interval when fixed, [FIRST_INTERVAL] when backing off. */
internal fun WaitPolicy.firstGap(): Long = if (this is WaitPolicy.Poll && !backoff) interval else FIRST_INTERVAL
