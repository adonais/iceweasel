/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import org.junit.Assert.assertEquals
import org.junit.AssumptionViolatedException
import org.junit.Test

class AttemptFinalizationContractTest {
    @Test
    fun aPassingBodyAndVerifiedCleanupProduceACompletePass() {
        val finalization = AttemptFinalization()
        finalization.recordBody(TestStatus.PASS)
        finalization.beginCleanup()
        finalization.finishCleanup()

        val fields = finalization.terminalFields("test", null)

        assertEquals("PASS", fields["outcome"])
        assertEquals("VERIFIED", fields["cleanupOutcome"])
        assertEquals(true, fields["complete"])
        assertEquals(emptyList<String>(), fields["failureOrigins"])
    }

    @Test
    fun bodyAndCleanupFailuresRemainIndependentlyAttributed() {
        val finalization = AttemptFinalization()
        finalization.recordBody(TestStatus.FAIL)
        finalization.beginCleanup()
        finalization.recordCleanupFailure("activityState")
        finalization.finishCleanup()

        val fields = finalization.terminalFields("test", AssertionError("body"))

        assertEquals("FAIL", fields["outcome"])
        assertEquals("FAIL", fields["bodyOutcome"])
        assertEquals("FAILED", fields["cleanupOutcome"])
        assertEquals(listOf("body", "cleanup"), fields["failureOrigins"])
        assertEquals(listOf("activityState"), fields["failedCleanupStages"])
        assertEquals(true, fields["complete"])
    }

    @Test
    fun setupFailureIsExplicitlyIncomplete() {
        val fields = AttemptFinalization().terminalFields("test", IllegalStateException("setup"))

        assertEquals("FAIL", fields["outcome"])
        assertEquals("UNKNOWN", fields["bodyOutcome"])
        assertEquals("NOT_REACHED", fields["cleanupOutcome"])
        assertEquals(false, fields["complete"])
        assertEquals(listOf("setup"), fields["failureOrigins"])
    }

    @Test
    fun failureOutsideAVerifiedPassingBodyIsNotHidden() {
        val finalization = AttemptFinalization()
        finalization.recordBody(TestStatus.PASS)
        finalization.beginCleanup()
        finalization.finishCleanup()

        val fields = finalization.terminalFields("test", IllegalStateException("legacy teardown"))

        assertEquals("FAIL", fields["outcome"])
        assertEquals(true, fields["complete"])
        assertEquals(listOf("outerRule"), fields["failureOrigins"])
    }

    @Test
    fun assumptionViolationRemainsASkipAfterVerifiedCleanup() {
        val finalization = AttemptFinalization()
        finalization.recordBody(TestStatus.SKIP)
        finalization.beginCleanup()
        finalization.finishCleanup()

        val fields = finalization.terminalFields("test", AssumptionViolatedException("not applicable"))

        assertEquals("SKIP", fields["outcome"])
        assertEquals("SKIP", fields["bodyOutcome"])
        assertEquals(true, fields["complete"])
        assertEquals(emptyList<String>(), fields["failureOrigins"])
    }
}
