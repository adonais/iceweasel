/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation.behavior

object BehaviorShardData {
    fun loadShard(
        shardIndex: Int,
        shardCount: Int,
        runStateOverride: String? = null,
    ): List<Array<Any>> {
        val runState = runStateOverride
            ?: System.getProperty("testRunState")?.takeIf { it.isNotBlank() }
            ?: ""

        return BehaviorCaseFactory
            .buildBehaviorCasesForShard(
                runState = runState,
                shardIndex = shardIndex,
                shardCount = shardCount,
            )
            .map { arrayOf(it as Any) }
    }
}
