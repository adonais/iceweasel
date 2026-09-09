/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.interaction.shards

import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import org.mozilla.fenix.ui.efficiency.generation.interaction.BaseInteractionShardTest
import org.mozilla.fenix.ui.efficiency.generation.interaction.InteractionCase
import org.mozilla.fenix.ui.efficiency.generation.interaction.InteractionShardData

@RunWith(Parameterized::class)
class InteractionShard01(private val case: InteractionCase) : BaseInteractionShardTest(case) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{index}: {0}")
        fun data(): List<Array<Any>> =
            InteractionShardData.loadShard(
                shardIndex = 1,
                shardCount = 1,
            )
    }

    @Test
    fun verifyInteractionCase() {
        runInteractionCase()
    }
}
