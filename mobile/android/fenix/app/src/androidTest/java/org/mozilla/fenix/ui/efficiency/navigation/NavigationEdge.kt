/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation

data class NavigationEdge(
    val source: NavigationNodeId,
    val target: NavigationNodeId,
    val steps: List<NavigationStep>,
    val effects: List<NavigationEffect> = emptyList(),
    val launch: LaunchConfig? = null,
    val routeVariant: NavigationRouteVariant? = null,
    val purpose: NavigationRoutePurpose = NavigationRoutePurpose.SETUP,
    val arrival: NavigationArrival = NavigationArrival.ACTION,
    val requires: Set<NavigationFact> = emptySet(),
    val forbids: Set<NavigationFact> = emptySet(),
    val provides: Set<NavigationFact> = emptySet(),
    val invalidates: Set<NavigationFact> = emptySet(),
    val traits: Set<NavigationRouteTrait> = emptySet(),
) {
    val from: String
        get() = source.value

    val to: String
        get() = target.value

    val variant: String?
        get() = routeVariant?.value

    val routeId: NavigationRouteId
        get() = NavigationRouteId(listOfNotNull("$source->$target", routeVariant).joinToString("#"))

    val id: String
        get() = routeId.value

    fun canTraverse(facts: Set<NavigationFact>): Boolean = requires.all { it in facts } && forbids.none { it in facts }

    fun traverse(state: NavigationState): NavigationState {
        require(state.page == from) {
            "Cannot traverse '$id' from '${state.page}'"
        }
        require(canTraverse(state.facts)) {
            "Navigation state ${state.facts} does not satisfy '$id'"
        }

        return NavigationState(
                node = target,
                facts = (state.facts - invalidates) + provides,
            )
            .normalized()
    }
}

enum class NavigationRoutePurpose {
    SETUP,
    COVERAGE,
}

enum class NavigationArrival {
    ACTION,
    LAUNCH_REACHED,
    EDGE_COMPLETION,
}

sealed interface NavigationEffect {
    data class CreateBookmark(
        val url: String,
        val title: String,
        val position: UInt? = null,
    ) : NavigationEffect
}
