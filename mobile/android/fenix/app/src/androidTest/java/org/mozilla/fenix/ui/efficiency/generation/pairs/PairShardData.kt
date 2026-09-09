/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.pairs

import org.mozilla.fenix.ui.efficiency.generation.NavigationGraphBootstrap
import org.mozilla.fenix.ui.efficiency.generation.ShardUtils

object PairShardData {

    fun loadShard(
        shardIndex: Int,
        shardCount: Int,
        runStateOverride: String? = null,
    ): List<Array<Any>> =
        ShardUtils.loadShard(
            shardIndex = shardIndex,
            shardCount = shardCount,
            runStateOverride = runStateOverride,
        ) { runState, shard, count ->
            // Pairs is the one domain whose shard loading needs to ensure the navigation graph is
            // bootstrapped first; kept here rather than forced into the shared shell.
            NavigationGraphBootstrap.ensureInitialized()
            PairCaseFactory.buildPairCasesForShard(
                runState = runState,
                shardIndex = shard,
                shardCount = count,
            )
        }
}
