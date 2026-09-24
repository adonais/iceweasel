/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticFaultInjectionContractTest {
    @Test
    fun processKillRequiresTheAllowlistedPointAndExactMethod() {
        val request =
            DiagnosticFaultRequest(
                DiagnosticFaultInjection.KILL_PROCESS_AFTER_BODY,
                "targetMethod",
            )

        assertTrue(request.killsAfterPassingBody("targetMethod(pkg.Test)"))
        assertFalse(request.killsAfterPassingBody("otherMethod(pkg.Test)"))
    }

    @Test
    fun unknownFaultPointCannotTerminateTheProcess() {
        val request = DiagnosticFaultRequest("unknown", "targetMethod")

        assertFalse(request.killsAfterPassingBody("targetMethod(pkg.Test)"))
    }

    @Test
    fun missingTargetCannotTerminateTheProcess() {
        val request =
            DiagnosticFaultRequest(
                DiagnosticFaultInjection.KILL_PROCESS_AFTER_BODY,
                null,
            )

        assertFalse(request.killsAfterPassingBody("targetMethod(pkg.Test)"))
    }
}
