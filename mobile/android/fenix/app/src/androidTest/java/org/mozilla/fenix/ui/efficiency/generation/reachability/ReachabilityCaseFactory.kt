/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.reachability

import android.util.Log
import mozilla.components.browser.state.action.TranslationsAction
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.generation.NavigationTestPlanner
import org.mozilla.fenix.ui.efficiency.generation.ShardUtils
import org.mozilla.fenix.ui.efficiency.generation.toDisplayLabel

object ReachabilityCaseFactory {

    private const val TAG = "ReachabilityCaseFactory"

    /**
     * Per-page navigation gates, keyed by display label. A page listed here is only navigated once its gate holds (see
     * [ReachabilityCase.precondition]). Most pages need none.
     *
     * The Settings "Translations" row is gated on `translationEngine.isEngineSupported`, which the Settings screen
     * reads once at creation and never re-evaluates. The real value is produced by an async engine-support check that
     * on the reachability emulator (a bare ARM device that never loads a page) does not resolve to `true` within the
     * test window, so the row would never appear. We therefore force the supported state into the store and wait for
     * the reducer to apply it before opening Settings. Forcing true is the deterministic stand-in for a device where
     * translations is supported, which is the configuration this reachability check is meant to exercise.
     */
    private val PRECONDITIONS: Map<String, () -> Boolean> =
        mapOf(
            "SettingsTranslationsPage" to
                {
                    val store = appContext.components.core.store
                    if (store.state.translationEngine.isEngineSupported != true) {
                        store.dispatch(TranslationsAction.SetEngineSupportedAction(isEngineSupported = true))
                    }
                    store.state.translationEngine.isEngineSupported == true
                }
        )

    fun buildReachabilityCases(runState: String): List<ReachabilityCase> {
        val generatedCases = NavigationTestPlanner.buildReachabilityCases()

        val cases = generatedCases.map { generated ->
            val label = generated.propertyName.toDisplayLabel()
            ReachabilityCase(
                label = label,
                testRailId = "TBD",
                page = generated.page,
                state = runState.ifBlank { "Navigation Reachability" },
                launch = generated.launch,
                precondition = PRECONDITIONS[label] ?: { true },
            )
        }

        Log.i(TAG, "Built ${cases.size} navigation reachability cases.")
        return cases
    }

    fun buildReachabilityCasesForShard(
        runState: String,
        shardIndex: Int,
        shardCount: Int,
    ): List<ReachabilityCase> {
        val allCases = buildReachabilityCases(runState)
        val shardCases =
            ShardUtils.filterForShard(
                items = allCases,
                shardIndex = shardIndex,
                shardCount = shardCount,
            )

        Log.i(
            TAG,
            "Shard $shardIndex/$shardCount contains ${shardCases.size} " +
                "of ${allCases.size} total navigation reachability cases.",
        )

        return shardCases
    }
}
