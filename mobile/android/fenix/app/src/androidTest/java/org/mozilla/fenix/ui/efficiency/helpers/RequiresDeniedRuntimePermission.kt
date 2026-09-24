/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.content.pm.PackageManager
import org.junit.runner.Description
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.logging.TestLogging

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresDeniedRuntimePermission(vararg val permissions: String)

object RuntimePermissionRequirements {
    fun assertSatisfied(description: Description) {
        val permissions = description.getAnnotation(RequiresDeniedRuntimePermission::class.java)?.permissions.orEmpty()
        if (permissions.isEmpty()) return

        val granted = permissions.filter { permission ->
            appContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
        }
        TestLogging.installed()
            .record(
                "stateRequirement",
                mapOf(
                    "testId" to description.displayName,
                    "deniedRuntimePermissions" to permissions.sorted(),
                    "satisfied" to granted.isEmpty(),
                ),
            )
        check(granted.isEmpty()) {
            "Runtime permissions must be reset before instrumentation starts: ${granted.sorted().joinToString()}"
        }
    }
}
