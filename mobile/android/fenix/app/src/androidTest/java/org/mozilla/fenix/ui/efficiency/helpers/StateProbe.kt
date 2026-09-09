/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.content.ComponentName
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.runBlocking
import mozilla.appservices.places.BookmarkRoot
import mozilla.components.browser.storage.sync.PlacesHistoryStorage
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.logging.TestLogging

/**
 * What the app actually holds, sampled before and after a test.
 *
 * Two questions this answers that a screenshot cannot.
 *
 * **Did this test start dirty?** The per-test reset on the fleet is `pm clear`, which wipes /data/data and runtime
 * permissions and nothing else. Anything a previous test changed outside that --- the launcher icon was the first one
 * found --- is still there. A non-zero count at test START is state somebody else left behind, and it is otherwise
 * invisible until a much later test fails for a reason that has nothing to do with it.
 *
 * **Is a UI failure actually a UI failure?** If history has three entries and the history screen shows none, that is a
 * specific and reportable bug in the path from the store to the UI. If the store is empty too, the test never created
 * the data and the UI is innocent. Today both look identical: "element not found".
 *
 * Sampling is deliberately cheap and count-based. Reading every row of every store on both sides of every test would
 * cost more than the information is worth, and counts plus a diff answer both questions above. Anything that throws is
 * recorded as absent rather than failing the test --- a probe that can break a passing run is worse than no probe.
 */
object StateProbe {

    /** One sample of everything worth watching. Ordered so the diff reads consistently. */
    fun sample(): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>()

        probe(out, "tabs") { appContext.components.core.store.state.tabs.size }
        probe(out, "tabsPrivate") {
            appContext.components.core.store.state.tabs.count { it.content.private }
        }
        probe(out, "history") {
            runBlocking { PlacesHistoryStorage(appContext.applicationContext).getVisited().size }
        }
        probe(out, "bookmarks") {
            runBlocking {
                appContext.components.core.bookmarksStorage.getTree(BookmarkRoot.Mobile.id).getOrNull()?.children?.size
                    ?: 0
            }
        }
        probe(out, "logins") {
            runBlocking { appContext.components.core.passwordsStorage.list().size }
        }
        probe(out, "addresses") {
            runBlocking { appContext.components.core.autofillStorage.getAllAddresses().size }
        }
        probe(out, "creditCards") {
            runBlocking { appContext.components.core.autofillStorage.getAllCreditCards().size }
        }
        probe(out, "topSites") {
            runBlocking { appContext.components.core.pinnedSiteStorage.getPinnedSites().size }
        }
        probe(out, "downloads") { appContext.components.core.store.state.downloads.size }
        // Not app data, so `pm clear` never resets it. This is the one that actually leaked.
        probe(out, "launcherIcon") { launcherIconAlias() }

        return out
    }

    /**
     * Emit a sample on the structured stream.
     *
     * `phase` is "start" or "end". Consumers pair them by testId and diff, rather than the harness computing a diff it
     * would then have to keep in sync with two samples.
     */
    fun record(phase: String, testId: String) {
        runCatching {
            TestLogging.installed()
                .record(
                    "state",
                    mapOf("phase" to phase, "testId" to testId) + sample(),
                )
        }
            .onFailure { Log.i(TAG, "state probe failed at $phase: ${it.message}") }
    }

    /** Which launcher alias is enabled, by name, or "default" when none has been overridden. */
    private fun launcherIconAlias(): String {
        val pm = appContext.packageManager
        val pkg = appContext.packageName
        val info =
            pm.getPackageInfo(
                pkg,
                PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
            )
        val enabled =
            info.activities
                .orEmpty()
                .map { it.name }
                .filter { it.startsWith("$pkg.App") || it == "$pkg.AlternativeApp" }
                .filter {
                    pm.getComponentEnabledSetting(ComponentName(pkg, it)) ==
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                }
        return enabled.firstOrNull()?.removePrefix("$pkg.") ?: "default"
    }

    /** Record a value, or the reason it could not be read. Never throws. */
    private inline fun probe(into: MutableMap<String, Any?>, key: String, read: () -> Any?) {
        into[key] = runCatching(read).getOrElse { "unreadable: ${it::class.simpleName}" }
    }

    private const val TAG = "StateProbe"
}
