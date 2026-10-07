/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import androidx.annotation.VisibleForTesting
import androidx.navigation.NavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import mozilla.components.lib.crash.store.CrashReportOption
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.utils.Settings

class CrashReporterController(
    @get:VisibleForTesting internal val sessionId: String,
    @get:VisibleForTesting internal val currentNumberOfTabs: Int,
    @get:VisibleForTesting internal val components: Components,
    @get:VisibleForTesting internal val settings: Settings,
    @get:VisibleForTesting internal val navController: NavController,
    @get:VisibleForTesting internal val appStore: AppStore,
) {

    /**
     * Restore all sessions and optionally report pending non-fatal crashes.
     *
     * @param sendCrashes If true, submit crash reports for all current non-fatal crashes.
     * @return [Job] allowing to check status / cancel the reporting operation or null if reporting is disabled.
     */
    fun handleCloseAndRestore(sendCrashes: Boolean): Job? {
        val job = submitPendingNonFatalCrashesIfNecessary(sendCrashes)

        components.useCases.sessionUseCases.crashRecovery.invoke()

        return job
    }

    /**
     * Closes the current tab, restore all sessions and optionally report pending non-fatal crashes.
     *
     * @param reportCrashes If true, submit crash reports for all current non-fatal crashes.
     * @return [Job] allowing to check status / cancel the reporting operation or null if reporting is disabled.
     */
    fun handleCloseAndRemove(reportCrashes: Boolean): Job? {
        val job = submitPendingNonFatalCrashesIfNecessary(reportCrashes)

        components.useCases.tabsUseCases.removeTab(sessionId)
        components.useCases.sessionUseCases.crashRecovery.invoke()

        // When the only tab crashed and the user chose to close it we'll navigate to Home.
        if (currentNumberOfTabs == 1) {
            navController.navigate(BrowserFragmentDirections.actionGlobalHome())
        }

        return job
    }

    /**
     * Returns true if the "Send to Mozilla" checkbox should be visible, false otherwise. Note that visibility of the
     * checkbox gates on the user's preference only. Whether the report can be submitted additionally depends on the
     * build type via [Settings.isCrashReportingEnabled].
     */
    internal fun isCrashReportCheckboxVisible(): Boolean {
        return settings.crashReportOption() != CrashReportOption.Never
    }

    /** Returns true if the "Send to Mozilla" checkbox should be initially checked, false otherwise. */
    internal fun isCrashReportCheckboxInitiallyChecked(): Boolean {
        return settings.crashReportOption() != CrashReportOption.Never
    }

    /**
     * Submits all pending non-fatal crash reports if the "Send crash" checkbox was checked and the report crashes
     * setting is enabled. Also clears the current list of non-fatal crashes irrespective of whether they are reported
     * or not.
     *
     * @param reportCrashes A second condition beside crash reporting being enabled in app settings based on which the
     *   current crashes will be reported or immediately disposed off.
     * @return [Job] allowing to check status / cancel the reporting operation or null if reporting is disabled.
     */
    @VisibleForTesting
    internal fun submitPendingNonFatalCrashesIfNecessary(reportCrashes: Boolean): Job? {
        var job: Job? = null
        if (reportCrashes && settings.isCrashReportingEnabled) {
            job =
                components.applicationScope.launch(Dispatchers.IO) {
                    val crashes = appStore.state.nonFatalCrashes
                    crashes.forEach {
                        components.analytics.crashReporter.submitReport(it)
                        appStore.dispatch(AppAction.RemoveNonFatalCrash(it))
                    }
                }
        } else {
            appStore.dispatch(AppAction.RemoveAllNonFatalCrashes)
        }

        return job
    }
}
