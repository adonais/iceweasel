/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import java.lang.reflect.Field

/** A discoverable selector catalog used by readiness oracles, typed groups, and factory model inspection. */
interface SelectorContainer {
    val scrollTraversalOrder: Map<SelectorGroup, List<Selector>>
        get() = emptyMap()

    val all: List<Selector>
        get() = SelectorDiscovery.discover(this)

    fun selectorsIn(group: SelectorGroup): List<Selector> {
        val members = all.filter { group in it.groups }
        val scrolling = members.filter { it.scrollDirection != null }
        return members.filter { it.scrollDirection == null } + (scrollTraversalOrder[group] ?: scrolling)
    }
}

private object SelectorDiscovery {
    private data class NamedSelector(val field: Field, val selector: Selector)

    private val cache = mutableMapOf<Class<*>, List<Selector>>()

    @Synchronized
    fun discover(container: SelectorContainer): List<Selector> =
        cache.getOrPut(container.javaClass) {
            val namedSelectors =
                container.javaClass.declaredFields
                    .filter { Selector::class.java.isAssignableFrom(it.type) }
                    .map { field ->
                        field.isAccessible = true
                        val value = field.get(container)
                        require(value is Selector) {
                            "Expected Selector for field '${field.name}', got ${value?.javaClass}"
                        }
                        NamedSelector(field, value)
                    }
                    .sortedBy { it.field.name }

            namedSelectors.forEachIndexed { index, named ->
                val duplicate = namedSelectors.take(index).firstOrNull { it.selector === named.selector }
                require(duplicate == null) {
                    "Selector fields '${duplicate?.field?.name}' and '${named.field.name}' refer to the same instance"
                }
            }

            namedSelectors.map { it.selector }.also { validateScrollTraversalOrder(container, it) }
        }

    private fun validateScrollTraversalOrder(
        container: SelectorContainer,
        selectors: List<Selector>,
    ) {
        val scrollingByGroup =
            selectors
                .filter { it.scrollDirection != null }
                .flatMap { selector -> selector.groups.map { it to selector } }
                .groupBy({ it.first }, { it.second })

        scrollingByGroup
            .filterValues { it.size > 1 }
            .forEach { (group, expected) ->
                val actual = container.scrollTraversalOrder[group]
                require(actual != null && actual.hasSameInstancesAs(expected)) {
                    "${container.javaClass.simpleName} must declare every scrolling selector in traversal order for group '$group'"
                }
            }

        container.scrollTraversalOrder.forEach { (group, ordered) ->
            val expected = scrollingByGroup[group].orEmpty()
            require(ordered.hasSameInstancesAs(expected)) {
                "${container.javaClass.simpleName} has an invalid scroll traversal order for group '$group'"
            }
        }
    }

    private fun List<Selector>.hasSameInstancesAs(other: List<Selector>): Boolean =
        size == other.size && all { selector -> count { it === selector } == other.count { it === selector } }
}
