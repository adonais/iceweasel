/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import kotlin.math.roundToInt
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.DurationUnit

/**
 * How fast an article is being read out, so that a piece of text can be sized in seconds rather than in characters.
 *
 * This is always measured and never assumed. The rate belongs to the voice rather than to the language, so two voices
 * in one language do not share it and a table of languages cannot hold it, and the engine offers no way to ask.
 * [measuredFrom] takes it from audio the engine has already produced, which is the only place it can be known from.
 *
 * @property charsPerSecond Characters read out per second.
 */
internal data class SpeechRate(val charsPerSecond: Double) {

    init {
        require(charsPerSecond > 0) { "charsPerSecond must be positive, was $charsPerSecond" }
    }

    /**
     * How many characters fit in [duration] of speech at this rate.
     *
     * At least one, so that a caller asking for an implausibly short piece still gets a limit it can chunk against
     * rather than zero.
     */
    fun charsIn(duration: Duration): Int =
        (duration.toDouble(DurationUnit.SECONDS) * charsPerSecond).roundToInt().coerceAtLeast(1)

    /** How long [chars] characters take to read out at this rate. */
    fun durationOf(chars: Int): Duration = (chars / charsPerSecond).seconds

    companion object {
        /**
         * The rate [numChars] characters were read out at, given the [audioLength] the engine produced for them.
         *
         * [readWavAudio] is where the duration of a chunk on disk comes from, so the two are used together: synthesize
         * something, measure the file, and size everything after it from the answer.
         */
        fun measuredFrom(numChars: Int, audioLength: Duration): SpeechRate {
            require(numChars > 0) { "chars must be positive, was $numChars" }
            require(audioLength > Duration.ZERO) { "audio must last some time, was $audioLength" }

            return SpeechRate(numChars / audioLength.toDouble(DurationUnit.SECONDS))
        }
    }
}
