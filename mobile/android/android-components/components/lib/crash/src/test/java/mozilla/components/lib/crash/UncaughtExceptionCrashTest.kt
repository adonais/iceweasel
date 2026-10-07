/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.crash

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UncaughtExceptionCrashTest {

    @Test
    fun `to and from bundle`() {
        val exception = RuntimeException("Kaput")
        val crash = Crash.UncaughtExceptionCrash(0, exception, arrayListOf())

        val bundle = crash.toBundle()
        val otherCrash = Crash.UncaughtExceptionCrash.fromBundle(bundle)

        assertEquals(crash.uuid, otherCrash.uuid)
        assertEquals(crash.timestamp, otherCrash.timestamp)
        assertEquals(crash.breadcrumbs, otherCrash.breadcrumbs)
        assertEquals(crash.throwable.message, otherCrash.throwable.message)
        assertArrayEquals(crash.throwable.stackTrace, otherCrash.throwable.stackTrace)
    }
}
