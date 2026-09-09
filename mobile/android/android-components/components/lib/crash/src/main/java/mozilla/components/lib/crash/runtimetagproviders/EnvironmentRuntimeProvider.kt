/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.crash.runtimetagproviders

import java.util.Locale
import java.util.concurrent.TimeUnit
import mozilla.components.lib.crash.RuntimeTag
import mozilla.components.lib.crash.RuntimeTagProvider

/** Interface to provide information about the current version of the application */
fun interface StartTimeProvider {

    /** Get the start time of the application. */
    fun getStartTime(): Long
}

private object DefaultStartTimeProvider : StartTimeProvider {
    // The process start time is captured once for the lifetime of the app, so there is no
    // per-instance clock to inject here.
    @Suppress("NoSystemCurrentTimeMillis") private val startTime = System.currentTimeMillis()

    override fun getStartTime() = startTime
}

/** Includes information about environment values with the crash so that it can be persisted. */
class EnvironmentRuntimeProvider(private val startTimeProvider: StartTimeProvider = DefaultStartTimeProvider) :
    RuntimeTagProvider {
    override fun invoke(): Map<String, String> {
        return mapOf(
            RuntimeTag.LOCALE to Locale.getDefault().toString(),
            RuntimeTag.START_TIME to TimeUnit.MILLISECONDS.toSeconds(startTimeProvider.getStartTime()).toString(),
        )
    }
}
