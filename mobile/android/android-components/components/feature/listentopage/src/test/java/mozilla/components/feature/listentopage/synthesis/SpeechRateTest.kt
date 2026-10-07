/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import kotlin.test.assertFailsWith
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechRateTest {

    @Test
    fun `test that the rate is taken from the audio the engine produced`() {
        val rate = SpeechRate.measuredFrom(numChars = 100, audioLength = 10.seconds)

        assertEquals(10.0, rate.charsPerSecond, 0.0)
    }

    @Test
    fun `test that a minute of speech is a very different amount of text in a slowly read language`() {
        // The English and Chinese rates measured on a device
        assertEquals(1068, SpeechRate(17.8).charsIn(60.seconds))
        assertEquals(234, SpeechRate(3.9).charsIn(60.seconds))
    }

    @Test
    fun `test that an implausibly short budget still leaves room for one character`() {
        assertEquals(1, SpeechRate(3.9).charsIn(1.milliseconds))
    }

    @Test
    fun `test that the duration of a piece of text follows the rate`() {
        assertEquals(60L, SpeechRate(17.8).durationOf(1068).inWholeSeconds)
        assertEquals(60L, SpeechRate(3.9).durationOf(234).inWholeSeconds)
    }

    @Test
    fun `test that a duration converted to characters and back is unchanged`() {
        val rate = SpeechRate.measuredFrom(numChars = 1000, audioLength = 42.seconds)

        assertEquals(1000, rate.charsIn(rate.durationOf(1000)))
    }

    @Test
    fun `test that a rate nothing could be read out at is rejected`() {
        assertFailsWith<IllegalArgumentException> { SpeechRate(0.0) }
        assertFailsWith<IllegalArgumentException> { SpeechRate(-1.0) }
    }

    @Test
    fun `test that a measurement of nothing is rejected`() {
        assertFailsWith<IllegalArgumentException> { SpeechRate.measuredFrom(numChars = 0, audioLength = 5.seconds) }
        assertFailsWith<IllegalArgumentException> {
            SpeechRate.measuredFrom(numChars = 100, audioLength = Duration.ZERO)
        }
    }
}
