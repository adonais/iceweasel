/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import android.content.Context
import androidx.annotation.VisibleForTesting
import org.mozilla.fenix.Config
import java.io.File

/**
 * Detects if the app experienced a startup crash by using a canary.
 */
interface StartupCrashCanary {

    /**
     * True if a startup crash was detected.
     */
    val startupCrashDetected: Boolean

    /**
     * Creates a canary to detect potential crashes.
     */
    suspend fun createCanary()

    /**
     * Removes the canary after successful startup.
     */
    suspend fun clearCanary()

    /**
     * Factory for [StartupCrashCanary].
     */
    companion object {
        private var instance: StartupCrashCanary? = null

        /**
         * Builds a [StartupCrashCanary] or returns the singleton if it exists.
         */
        fun build(context: Context): StartupCrashCanary = instance
            ?: FileBasedCrashCanary(
                canaryFile = File(context.filesDir, ".canary").startupCanary(),
            ).also { instance = it }
    }
}

internal fun File.startupCanary() =
    CanaryFile(
        exists = { this.exists() },
        touch = { this.createNewFile() },
        remove = { this.delete() },
    )

internal data class CanaryFile(val exists: () -> Boolean, val touch: () -> Unit, val remove: () -> Unit)

@VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
internal class FileBasedCrashCanary(
    val canaryFile: CanaryFile,
    val useNewCrashReporter: Boolean = Config.channel.isNightlyOrDebug,
) : StartupCrashCanary {

    override var startupCrashDetected = useNewCrashReporter && canaryFile.exists()
        private set

    override suspend fun createCanary() {
        if (useNewCrashReporter) {
            canaryFile.touch()
            startupCrashDetected = true
        }
    }

    override suspend fun clearCanary() {
        canaryFile.remove()
        startupCrashDetected = false
    }
}
