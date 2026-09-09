/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.content.ComponentName
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.AppAndSystemHelper.deleteBookmarksStorage
import org.mozilla.fenix.helpers.AppAndSystemHelper.deletePinnedSitesStorage
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.logging.TestLogging

/**
 * The app state this harness clears between tests, as one named list.
 *
 * Two reasons it is here rather than inline in BaseTest's rule.
 *
 * **It has to run at both ends.** It used to run only at the START of a test, so a failing test left everything it
 * created on the device until the next test cleared up before itself --- and if it was the last test in the class,
 * indefinitely. That is why devices are found dirty long after a run.
 *
 * **A failed clear has to be distinguishable from a leak.** Every clear was wrapped in runCatching with a log line, so
 * a clear that errored and a genuine state leak produced identical symptoms: a later test starting with state it did
 * not create. [clear] returns what failed and puts it on the structured stream, so the ledger can say "clean, but the
 * clear that would have made it clean errored" --- a different and far more actionable fact than either "clean" or
 * "dirty".
 *
 * Note what is NOT here. `FenixTestRule` at rule order 0 wraps `TestSetupRule`, which separately clears history,
 * bookmarks, site permissions, the downloads folder and notifications before any of this runs. The effective per-test
 * cleanup is the union of the two, which is exactly the confusion this class exists to start unpicking: reading either
 * one alone tells you the wrong answer about what leaks.
 */
object AppDataCleaner {

    /** One clear, named so a failure can say which. */
    private class Step(val name: String, val run: suspend () -> Unit)

    private val steps =
        listOf(
            Step("bookmarks") { deleteBookmarksStorage() },
            Step("pinnedSites") { deletePinnedSitesStorage() },
            Step("sessions") {
                withContext(Dispatchers.IO) { appContext.components.core.sessionStorage.clear() }
            },
            // A leftover address changes the Autofill settings layout and can push "Add address"
            // off-screen; a leftover card replaces "Add card" with "Manage cards", so a card test
            // starts on a different screen than it expects.
            Step("autofill") {
                withContext(Dispatchers.IO) {
                    val autofill = appContext.components.core.autofillStorage
                    autofill.getAllAddresses().forEach { autofill.deleteAddress(it.guid) }
                    autofill.getAllCreditCards().forEach { autofill.deleteCreditCard(it.guid) }
                }
            },
            // Inherited logins mean a re-submit of the same credentials shows no save prompt, which
            // reads as a spurious failure.
            Step("logins") {
                withContext(Dispatchers.IO) { appContext.components.core.passwordsStorage.wipeLocal() }
            },
            Step("tabs") { appContext.components.useCases.tabsUseCases.removeAllTabs() },
            Step("launcherIcon") { resetLauncherIconAliases() },
        )

    /**
     * Run every clear. Returns the names of the ones that failed.
     *
     * Never throws. A cleanup that fails the test it was preparing is worse than a cleanup that did not happen --- but
     * it must not be silent either, which is what the return value and the record are for.
     *
     * `phase` is "before" or "after", so a consumer can tell a test that started dirty from one that failed to tidy up
     * after itself.
     */
    fun clear(phase: String, testId: String): List<String> {
        val failed = mutableListOf<String>()
        runBlocking {
            for (step in steps) {
                runCatching { step.run() }
                    .onFailure {
                        failed += step.name
                        Log("${step.name} clear failed at $phase: ${it.message}")
                    }
            }
        }
        runCatching {
            TestLogging.installed()
                .record(
                    "cleanup",
                    mapOf("phase" to phase, "testId" to testId, "failed" to failed.joinToString(",")),
                )
        }
        return failed
    }

    private fun Log(msg: String) = android.util.Log.i("AppDataCleaner", msg)

    /**
     * Put the launcher icon back to the manifest default.
     *
     * The app icon is not app data --- changing it calls PackageManager.setComponentEnabledSetting on activity-aliases,
     * which lives in the package manager's own state. `pm clear` wipes /data/data/<pkg> and runtime permissions and
     * does not touch it, so an icon a test switched stays switched for every later test on that device.
     *
     * That is not theoretical: verifyTheChangeAppIconButtonTest sets the icon to Dark, and
     * verifyTheDefaultAppIconSettingTest then asserts it reads Default. Whether that fails depends on which order the
     * work queue happens to hand them to the same device, so it is an intermittent failure with no intermittent cause.
     *
     * COMPONENT_ENABLED_STATE_DEFAULT restores whatever the manifest declares, which is the default icon enabled and
     * the alternatives disabled --- a reset, not a guess at the right state.
     */
    private fun resetLauncherIconAliases() {
        val pm = appContext.packageManager
        val pkg = appContext.packageName
        val info =
            pm.getPackageInfo(
                pkg,
                PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
            )
        info.activities
            .orEmpty()
            .map { it.name }
            .filter { it.startsWith("$pkg.App") || it == "$pkg.AlternativeApp" }
            .forEach { name ->
                pm.setComponentEnabledSetting(
                    ComponentName(pkg, name),
                    PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
                    PackageManager.DONT_KILL_APP,
                )
            }
    }
}
