/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.pairs

import android.util.Log
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest

abstract class BasePairShardTest(private val case: PairCase) : BaseTest() {

    protected fun runNavigationPairCase() {
        Log.i(
            "NavigationPairTest",
            "TestRail=${case.testRailId} Pair=${case.label} State=${case.state}",
        )
        println("TestRail=${case.testRailId} Pair=${case.label} State=${case.state}")

        val firstPageObj: BasePage = case.firstPage(on)
        firstPageObj.navigateToPage()

        val secondPageObj: BasePage = case.secondPage(on)
        secondPageObj.navigateToPage()
    }
}
