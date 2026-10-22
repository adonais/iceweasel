/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import kotlin.test.assertNotNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SynthesisJobPriorityLockTest {

    @Test
    fun `test that a lock nobody holds is granted`() {
        assertNotNull(SynthesisJobPriorityLock().tryClaim(PlaybackIntent.Recovery))
    }

    @Test
    fun `test that a claim is refused while something stronger holds the lock`() {
        val turn = SynthesisJobPriorityLock()
        val seek = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        assertNull(turn.tryClaim(PlaybackIntent.Recovery))
        assertTrue("the refused claim took the turn anyway", seek.isHeld)
    }

    @Test
    fun `test that a stronger claim takes the lock`() {
        val turn = SynthesisJobPriorityLock()
        val recovery = assertNotNull(turn.tryClaim(PlaybackIntent.Recovery))

        val seek = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        assertFalse(recovery.isHeld)
        assertTrue(seek.isHeld)
    }

    @Test
    fun `test that a claim of the same intent takes the lock`() {
        val turn = SynthesisJobPriorityLock()
        val first = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        val second = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        assertFalse(first.isHeld)
        assertTrue(second.isHeld)
    }

    @Test
    fun `test that a restart is refused by nothing`() {
        val turn = SynthesisJobPriorityLock()
        turn.tryClaim(PlaybackIntent.Restart)

        assertNotNull(turn.tryClaim(PlaybackIntent.Restart))
    }

    @Test
    fun `test that releasing a superseded handle leaves the current one holding the lock`() {
        val turn = SynthesisJobPriorityLock()
        val first = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))
        val second = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        first.release()

        assertTrue(second.isHeld)
        assertNull("a weaker claim got in on the back of a stale release", turn.tryClaim(PlaybackIntent.Recovery))
    }

    @Test
    fun `test that a released lock lets a weaker claim through`() {
        val turn = SynthesisJobPriorityLock()
        assertNotNull(turn.tryClaim(PlaybackIntent.Seek)).release()

        assertNotNull(turn.tryClaim(PlaybackIntent.Recovery))
    }

    @Test
    fun `test that releasing twice is not an error`() {
        val turn = SynthesisJobPriorityLock()
        val seek = assertNotNull(turn.tryClaim(PlaybackIntent.Seek))

        seek.release()
        seek.release()

        assertNotNull(turn.tryClaim(PlaybackIntent.Recovery))
    }
}
