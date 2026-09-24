/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.interaction

import kotlin.text.contains
import org.mozilla.fenix.ui.efficiency.generation.NavigationGraphBootstrap
import org.mozilla.fenix.ui.efficiency.generation.NavigationTestPlanner
import org.mozilla.fenix.ui.efficiency.generation.toDisplayLabel
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageContext
import org.mozilla.fenix.ui.efficiency.helpers.SelectorId

object InteractionTestPlanner {

    data class InteractionCasePlan(
        val pagePropertyName: String,
        val pageName: String,
        val page: PageContext.() -> BasePage,
        val interactionSelectorName: String,
        val interactionDescription: String,
        val expectedResultOf: SelectorId,
        val expectedSelectorNames: List<String>,
        val pathCount: Int,
        val isRunnable: Boolean,
    )

    fun buildInteractionCases(): List<InteractionCasePlan> {
        val graph = NavigationGraphBootstrap.buildGraph()
        return NavigationTestPlanner.buildReachabilityCases(graph)
            .filter { it.propertyName.contains("bookmark", ignoreCase = true) }
            .flatMap { pageCase ->
                val pageName = pageCase.propertyName.toDisplayLabel()
                val pathCount = graph.findAllPaths("AppEntry", pageName).size
                val selectorRefs = SelectorCatalog.discoverSelectorsForPage(pageCase.propertyName)

                selectorRefs
                    .filter { it.selectorName.endsWith("_BUTTON") }
                    .map { button ->
                        val expectedResultOf = button.selector.id ?: SelectorId(button.selectorName)

                        val expectedSelectors =
                            selectorRefs
                                .filter { expectedResultOf in it.selector.appearsAfter }
                                .map { it.selectorName }
                                .sorted()

                        InteractionCasePlan(
                            pagePropertyName = pageCase.propertyName,
                            pageName = pageName,
                            page = pageCase.page,
                            interactionSelectorName = button.selectorName,
                            interactionDescription = button.selector.description,
                            expectedResultOf = expectedResultOf,
                            expectedSelectorNames = expectedSelectors,
                            pathCount = pathCount,
                            isRunnable = expectedSelectors.isNotEmpty(),
                        )
                    }
            }
            .sortedWith(compareBy({ it.pagePropertyName }, { it.interactionSelectorName }))
    }
}
