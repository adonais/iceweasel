/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeCanary(
    var existsState: Boolean = false,
    var touched: Boolean = false,
    var removed: Boolean = false,
) {
    fun asCanaryFile() = CanaryFile(
        exists = { existsState },
        touch = {
            touched = true
            existsState = true
        },
        remove = {
            removed = true
            existsState = false
        },
    )
}

class FileBasedCrashCanaryTest {

    @Test
    fun `GIVEN canary exists WHEN initializing THEN startupCrashDetected is true only when flag enabled`() {
        val fake = FakeCanary(existsState = true)
        val enabled = FileBasedCrashCanary(fake.asCanaryFile(), useNewCrashReporter = true)
        assertTrue(enabled.startupCrashDetected)

        val disabled = FileBasedCrashCanary(fake.asCanaryFile(), useNewCrashReporter = false)
        assertFalse(disabled.startupCrashDetected)
    }

    @Test
    fun `GIVEN useNewCrashReporter is true AND canary does not exist WHEN createCanary THEN canary is touched AND detection is true`() = runTest {
        val fake = FakeCanary(existsState = false)
        val canary = FileBasedCrashCanary(fake.asCanaryFile(), useNewCrashReporter = true)

        canary.createCanary()

        assertEquals(true, fake.touched)
        assertTrue(fake.existsState)
        assertTrue(canary.startupCrashDetected)
    }

    @Test
    fun `GIVEN useNewCrashReporter is false AND canary does not exist WHEN createCanary THEN canary is not touched AND detection remains false`() = runTest {
        val fake = FakeCanary(existsState = false)
        val canary = FileBasedCrashCanary(fake.asCanaryFile(), useNewCrashReporter = false)

        canary.createCanary()

        assertEquals(false, fake.touched)
        assertFalse(fake.existsState)
        assertFalse(canary.startupCrashDetected)
    }

    @Test
    fun `GIVEN canary exists WHEN clearCanary THEN canary is removed AND detection is false`() = runTest {
        val fake = FakeCanary(existsState = true)
        val canary = FileBasedCrashCanary(fake.asCanaryFile(), useNewCrashReporter = true)
        assertTrue(canary.startupCrashDetected)

        canary.clearCanary()
        assertEquals(true, fake.removed)
        assertFalse(fake.existsState)
        assertFalse(canary.startupCrashDetected)
    }
}
