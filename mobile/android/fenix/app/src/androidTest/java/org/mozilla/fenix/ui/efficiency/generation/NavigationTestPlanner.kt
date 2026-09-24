/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation

import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageContext
import org.mozilla.fenix.ui.efficiency.navigation.LaunchConfig
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.PageCatalog

// TODO (Jackie J. 3/23/2026): fix all of these horrible names, they're temporary.
object NavigationTestPlanner {

    data class ReachabilityCase(
        val propertyName: String,
        val page: PageContext.() -> BasePage,
        val launch: LaunchConfig = LaunchConfig(),
    ) {
        override fun toString(): String = propertyName
    }

    data class NavigationPairCasePlan(
        val firstPropertyName: String,
        val secondPropertyName: String,
        val firstPage: PageContext.() -> BasePage,
        val secondPage: PageContext.() -> BasePage,
        val distinctPathCount: Int,
    ) {
        override fun toString(): String = "$firstPropertyName -> $secondPropertyName"
    }

    fun buildReachabilityCases(graph: NavigationGraph = NavigationGraphBootstrap.buildGraph()): List<ReachabilityCase> {
        return PageCatalog.discoverNavigablePages()
            .map { pageRef ->
                ReachabilityCase(
                    propertyName = pageRef.propertyName,
                    page = pageRef.getter,
                    launch = graph.launchConfigFor(pageRef.propertyName.toDisplayLabel()) ?: LaunchConfig(),
                )
            }
            .sortedBy { it.propertyName }
    }

    fun buildNavigationPairCases(
        graph: NavigationGraph = NavigationGraphBootstrap.buildGraph()
    ): List<NavigationPairCasePlan> {
        val reachabilityCases = buildReachabilityCases(graph)

        val casesByPageName =
            reachabilityCases.filter { it.launch == LaunchConfig() }.associateBy { it.propertyName.toDisplayLabel() }
        val sortedPageNames = casesByPageName.keys.sorted()

        return buildList {
            for (firstPageName in sortedPageNames) {
                for (secondPageName in sortedPageNames) {
                    if (firstPageName == secondPageName) {
                        continue
                    }

                    val paths = graph.findAllPaths(firstPageName, secondPageName)
                    if (paths.isEmpty()) {
                        continue
                    }

                    val firstCase = casesByPageName.getValue(firstPageName)
                    val secondCase = casesByPageName.getValue(secondPageName)

                    add(
                        NavigationPairCasePlan(
                            firstPropertyName = firstCase.propertyName,
                            secondPropertyName = secondCase.propertyName,
                            firstPage = firstCase.page,
                            secondPage = secondCase.page,
                            distinctPathCount = paths.size,
                        )
                    )
                }
            }
        }
    }
}
