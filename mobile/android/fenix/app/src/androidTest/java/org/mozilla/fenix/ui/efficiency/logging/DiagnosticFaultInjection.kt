/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import android.os.Process
import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry

data class DiagnosticFaultRequest(
    val point: String?,
    val targetMethod: String?,
) {
    fun killsAfterPassingBody(testId: String): Boolean =
        point == DiagnosticFaultInjection.KILL_PROCESS_AFTER_BODY && targetMethod == testId.substringBefore("(")
}

object DiagnosticFaultInjection {
    fun afterPassingBody(testId: String) {
        val arguments = runCatching { InstrumentationRegistry.getArguments() }.getOrNull()
        val request =
            DiagnosticFaultRequest(
                point = arguments?.getString(FAULT_ARGUMENT),
                targetMethod = arguments?.getString(TARGET_METHOD_ARGUMENT),
            )
        if (!request.killsAfterPassingBody(testId)) return

        Log.e(TAG, "Terminating process after body result for $testId")
        Process.killProcess(Process.myPid())
    }

    const val KILL_PROCESS_AFTER_BODY = "kill_process_after_body"
    const val FAULT_ARGUMENT = "efficiencyDiagnosticFault"
    const val TARGET_METHOD_ARGUMENT = "efficiencyDiagnosticFaultTargetMethod"
    private const val TAG = "EfficiencyFault"
}
