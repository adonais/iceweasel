/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.interaction

import android.util.Log
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

abstract class BaseInteractionShardTest(private val case: InteractionCase) : BaseTest() {

    protected fun runInteractionCase() {
        Log.i(
            TAG,
            "TestRail=${case.testRailId} Interaction=${case.label} State=${case.state}",
        )

        println("--------------------------------------------------")
        println("Running interaction case: ${case.label}")
        println("Interaction selector: ${case.interactionSelectorName}")
        println("Expected selectors: ${case.expectedSelectorNames}")

        val pageObj: BasePage = case.page(on)
        pageObj.navigateToPage()

        println("Clicking selector: ${case.interactionSelector.description}")

        pageObj.mozClick(case.interactionSelector)

        case.expectedSelectors.forEach { selector ->
            println("Verifying selector: ${selector.description}")
            pageObj.mozVerify(selector)
        }
    }

    companion object {
        private const val TAG = "InteractionFactoryTest"
    }
}
