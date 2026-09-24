/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation

import android.util.Log
import java.io.File
import java.util.PriorityQueue
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfile

/**
 * The independently maintained, executable model used to plan and verify UI navigation.
 *
 * A graph is built and validated for one [org.mozilla.fenix.ui.efficiency.helpers.PageContext], rather than registered
 * process-wide, so routes cannot leak between tests and every modeled page must supply an arrival oracle.
 */
class NavigationGraph
private constructor(
    private val graph: Map<String, List<NavigationEdge>>,
    private val checkpointVerifiers: Map<String, (NavigationCheckpoint) -> Boolean>,
    private val nodes: Map<String, NavigationNode>,
) {
    class Builder(private val declaredNodes: Set<NavigationNode>? = null) {
        private val graph = mutableMapOf<String, MutableList<NavigationEdge>>()
        private val checkpointVerifiers = mutableMapOf<String, (NavigationCheckpoint) -> Boolean>()

        fun register(
            from: String,
            to: String,
            steps: List<NavigationStep>,
            effects: List<NavigationEffect> = emptyList(),
            launch: LaunchConfig? = null,
            variant: String? = null,
            purpose: NavigationRoutePurpose = NavigationRoutePurpose.SETUP,
            arrival: NavigationArrival = NavigationArrival.ACTION,
            requires: Set<NavigationFact> = emptySet(),
            forbids: Set<NavigationFact> = emptySet(),
            provides: Set<NavigationFact> = emptySet(),
            invalidates: Set<NavigationFact> = emptySet(),
            traits: Set<NavigationRouteTrait> = emptySet(),
        ) {
            val resolvedArrival =
                if (declaredNodes == null && steps.isEmpty() && effects.isEmpty()) {
                    NavigationArrival.EDGE_COMPLETION
                } else {
                    arrival
                }
            require((requires intersect forbids).isEmpty()) {
                "Navigation route '$from->$to' cannot require and forbid the same fact"
            }
            require((provides intersect invalidates).isEmpty()) {
                "Navigation route '$from->$to' cannot provide and invalidate the same fact"
            }
            require(steps.isNotEmpty() || effects.isNotEmpty() || resolvedArrival != NavigationArrival.ACTION) {
                "Zero-step navigation route '$from->$to' must declare how arrival is observed"
            }
            require(resolvedArrival == NavigationArrival.ACTION || steps.isEmpty()) {
                "${resolvedArrival.name} route '$from->$to' cannot contain UI actions"
            }

            val edge =
                NavigationEdge(
                    source = NavigationNodeId(from),
                    target = NavigationNodeId(to),
                    steps = steps,
                    effects = effects,
                    launch = launch,
                    routeVariant = variant?.let(::NavigationRouteVariant),
                    purpose = purpose,
                    arrival = resolvedArrival,
                    requires = requires,
                    forbids = forbids,
                    provides = provides,
                    invalidates = invalidates,
                    traits = traits,
                )
            check(graph.values.flatten().none { it.routeId == edge.routeId }) {
                "Duplicate navigation route '${edge.id}' ($steps, launch=$launch)"
            }
            val endpointRoutes = graph[from].orEmpty().filter { it.to == to }
            check(endpointRoutes.isEmpty() || (variant != null && endpointRoutes.none { it.variant == null })) {
                "Multiple navigation routes for $from -> $to require explicit variants"
            }
            graph.getOrPut(from) { mutableListOf() }.add(edge)
        }

        fun registerCheckpointVerifier(page: String, verifier: (NavigationCheckpoint) -> Boolean) {
            check(checkpointVerifiers.putIfAbsent(page, verifier) == null) {
                "Duplicate navigation checkpoint verifier for '$page'"
            }
        }

        fun build(): NavigationGraph {
            val endpoints = buildSet {
                graph.values.flatten().forEach { edge ->
                    add(edge.from)
                    add(edge.to)
                }
            }
            val nodeCatalog =
                declaredNodes?.associateBy { it.id.value }
                    ?: endpoints.associateWith { NavigationNode(NavigationNodeId(it), NavigationNodeKind.PAGE) }
            val unknownEndpoints = endpoints - nodeCatalog.keys
            check(unknownEndpoints.isEmpty()) {
                "Navigation routes reference undeclared nodes: ${unknownEndpoints.sorted().joinToString()}"
            }
            val unknownVerifiers = checkpointVerifiers.keys - nodeCatalog.keys
            check(unknownVerifiers.isEmpty()) {
                "Checkpoint verifiers reference undeclared nodes: ${unknownVerifiers.sorted().joinToString()}"
            }
            val requiredVerifiers =
                endpoints.filter { nodeCatalog.getValue(it).kind == NavigationNodeKind.PAGE }.toSet()
            val missingVerifiers = requiredVerifiers - checkpointVerifiers.keys
            check(declaredNodes == null || missingVerifiers.isEmpty()) {
                "Navigable nodes lack checkpoint verifiers: ${missingVerifiers.sorted().joinToString()}"
            }

            return NavigationGraph(
                graph = graph.mapValues { (_, edges) -> edges.toList() },
                checkpointVerifiers = checkpointVerifiers.toMap(),
                nodes = nodeCatalog,
            )
        }
    }

    fun verifyCheckpoint(checkpoint: NavigationCheckpoint): Boolean {
        val verifier =
            requireNotNull(checkpointVerifiers[checkpoint.state.page]) {
                "No navigation checkpoint verifier registered for '${checkpoint.state.page}'"
            }
        return verifier(checkpoint)
    }

    /** The LaunchConfig declared on any edge leading INTO [page], if any. */
    fun launchConfigFor(page: String): LaunchConfig? =
        graph.values.flatten().sortedWith(routeOrder).firstOrNull { it.to == page && it.launch != null }?.launch

    fun findPath(
        from: String,
        to: String,
        options: NavigationOptions = NavigationOptions(),
        initialFacts: Set<NavigationFact> = emptySet(),
    ): NavigationPath? {
        options.validateDestination(to)

        val initialState = NavigationState(NavigationNodeId(from), initialFacts).normalized()
        val initialWaypointIndex = options.advanceWaypoint(0, from)
        val initialWaypointPageIndices = if (initialWaypointIndex == 1) setOf(0) else emptySet()
        val eligibleSelfLoopExists =
            from == to &&
                graph[from].orEmpty().any { edge -> edge.to == to && edgeAllowed(edge, options, initialState) }

        val queue = PriorityQueue(pathOrder(to, options))
        val visited = mutableSetOf<SearchState>()

        queue.add(
            PathCandidate(
                state = initialState,
                states = listOf(initialState),
                edges = emptyList(),
                waypointIndex = initialWaypointIndex,
                waypointPageIndices = initialWaypointPageIndices,
                traversedRequiredRoutes = emptySet(),
            )
        )

        while (queue.isNotEmpty()) {
            val candidate = queue.remove()
            if (!visited.add(candidate.searchState())) continue

            if (
                options.goalSatisfied(
                    state = candidate.state,
                    destination = to,
                    waypointIndex = candidate.waypointIndex,
                    traversedRequiredRoutes = candidate.traversedRequiredRoutes,
                ) && (!eligibleSelfLoopExists || candidate.edges.isNotEmpty())
            ) {
                return NavigationPath(
                    pages = candidate.states.map { it.page },
                    edges = candidate.edges,
                    states = candidate.states,
                    waypointPageIndices = candidate.waypointPageIndices,
                )
            }

            for (edge in graph[candidate.state.page].orEmpty().sortedWith(routeOrder)) {
                if (!edgeAllowed(edge, options, candidate.state)) continue

                val nextState = edge.traverse(candidate.state)
                val nextWaypointIndex = options.advanceWaypoint(candidate.waypointIndex, nextState.page)
                val pageIndex = candidate.states.size
                val waypointPageIndices =
                    if (nextWaypointIndex > candidate.waypointIndex) {
                        candidate.waypointPageIndices + pageIndex
                    } else {
                        candidate.waypointPageIndices
                    }
                val traversedRequiredRoutes =
                    if (edge.id in options.requiredRoutes) {
                        candidate.traversedRequiredRoutes + edge.id
                    } else {
                        candidate.traversedRequiredRoutes
                    }

                queue.add(
                    PathCandidate(
                        state = nextState,
                        states = candidate.states + nextState,
                        edges = candidate.edges + edge,
                        waypointIndex = nextWaypointIndex,
                        waypointPageIndices = waypointPageIndices,
                        traversedRequiredRoutes = traversedRequiredRoutes,
                    )
                )
            }
        }

        return null
    }

    private fun edgeAllowed(
        edge: NavigationEdge,
        options: NavigationOptions,
        state: NavigationState,
    ): Boolean =
        edge.to !in options.excludedPages && edge.id !in options.excludedRoutes && edge.canTraverse(state.facts)

    /** Returns all registered page names found in the graph. */
    fun getAllPages(): Set<String> {
        return buildSet {
            addAll(graph.keys)
            graph.values.flatten().forEach { edge ->
                add(edge.from)
                add(edge.to)
            }
        }
    }

    fun diagnostics(): NavigationGraphDiagnostics =
        NavigationGraphDiagnostics(
            pages = getAllPages(),
            edges = graph.values.flatten().toList(),
            nodes = nodes.values.toSet(),
        )

    /**
     * Finds all distinct simple paths from [from] to [to].
     *
     * "Simple" means a page cannot appear twice in the same path. This structural view intentionally ignores route fact
     * guards; use [findPath] to select an executable path for a navigation state.
     */
    fun findAllPaths(from: String, to: String): List<NavigationPath> {
        val results = mutableListOf<NavigationPath>()

        if (from !in getAllPages() || to !in getAllPages()) {
            return emptyList()
        }

        findAllPathsDfs(
            current = from,
            target = to,
            visited = linkedSetOf(from),
            edgePath = mutableListOf(),
            results = results,
        )

        return results
    }

    private fun findAllPathsDfs(
        current: String,
        target: String,
        visited: LinkedHashSet<String>,
        edgePath: MutableList<NavigationEdge>,
        results: MutableList<NavigationPath>,
    ) {
        if (current == target) {
            results.add(
                NavigationPath(
                    pages = buildPageSequence(edgePath, current),
                    edges = edgePath.toList(),
                )
            )
            return
        }

        for (edge in graph[current].orEmpty().sortedWith(routeOrder)) {
            if (edge.to in visited) {
                continue
            }

            visited.add(edge.to)
            edgePath.add(edge)

            findAllPathsDfs(
                current = edge.to,
                target = target,
                visited = visited,
                edgePath = edgePath,
                results = results,
            )

            edgePath.removeAt(edgePath.lastIndex)
            visited.remove(edge.to)
        }
    }

    private fun buildPageSequence(edgePath: List<NavigationEdge>, terminalPage: String): List<String> {
        if (edgePath.isEmpty()) return listOf(terminalPage)

        val pages = mutableListOf<String>()
        pages.add(edgePath.first().from)
        edgePath.forEach { pages.add(it.to) }
        return pages
    }

    /** Logs every distinct simple path between two pages. */
    fun logAllPaths(from: String, to: String) {
        val paths = findAllPaths(from, to)

        Log.i(TAG, "Distinct navigation paths from '$from' to '$to': ${paths.size}")

        if (paths.isEmpty()) {
            Log.i(TAG, "   No distinct paths found.")
            return
        }

        paths.forEachIndexed { index, path ->
            Log.i(TAG, "   Path ${index + 1}: ${path.pages.joinToString(" -> ")}")

            if (path.edges.isEmpty()) {
                Log.i(TAG, "      (same page / zero-step path)")
            } else {
                path.edges.forEachIndexed { edgeIndex, edge ->
                    Log.i(
                        TAG,
                        "      Edge ${edgeIndex + 1}: ${edge.from} -> ${edge.to} " + "[${edge.steps.size} step(s)]",
                    )
                    edge.steps.forEachIndexed { stepIndex, step ->
                        Log.i(TAG, "         Step ${stepIndex + 1}: $step")
                    }
                }
            }
        }
    }

    /**
     * Logs a graph-wide summary of all distinct simple navigation paths.
     *
     * Useful before wiring this into navigateToPage.
     */
    fun logPathSummary() {
        val pages = getAllPages().sorted()
        var totalPaths = 0
        var pairCountWithPaths = 0

        Log.i(TAG, "Navigation path summary")
        Log.i(TAG, "   Registered pages: ${pages.size}")
        Log.i(TAG, "   Registered edges: ${graph.values.sumOf { it.size }}")

        for (from in pages) {
            for (to in pages) {
                if (from == to) continue

                val paths = findAllPaths(from, to)
                if (paths.isNotEmpty()) {
                    pairCountWithPaths++
                    totalPaths += paths.size

                    Log.i(
                        TAG,
                        "   $from -> $to : ${paths.size} distinct path(s)",
                    )
                }
            }
        }

        Log.i(TAG, "   Reachable page pairs: $pairCountWithPaths")
        Log.i(TAG, "   Total distinct paths across graph: $totalPaths")
    }

    fun logGraph() {
        Log.i(TAG, "Current navigation graph:")
        for ((from, edges) in graph) {
            for (edge in edges) {
                Log.i(TAG, " - $from -> ${edge.to} [${edge.steps.size} step(s)]")
            }
        }
    }

    fun exportDotToFile(outputFile: File): File {
        outputFile.writeText(toDot())
        Log.i(TAG, "Wrote DOT graph to: ${outputFile.absolutePath}")
        return outputFile
    }

    fun toDot(): String {
        return buildString {
            appendLine("digraph NavigationGraph {")
            appendLine("  rankdir=LR;")
            appendLine("  node [shape=box];")

            getAllPages().sorted().forEach { page ->
                appendLine("""  "${escapeDot(page)}";""")
            }

            graph.values.flatten().forEach { edge ->
                val style = if (edge.steps.isEmpty()) ", style=\"dashed\"" else ""
                val attrs = """label="${escapeDot(edge.id)} (${edge.steps.size})"$style"""

                appendLine("""  "${escapeDot(edge.from)}" -> "${escapeDot(edge.to)}" [$attrs];""")
            }

            appendLine("}")
        }
    }

    private fun escapeDot(value: String): String {
        return value.replace("\\", "\\\\").replace("\"", "\\\"")
    }

    private val routeOrder = compareBy<NavigationEdge>({ it.purpose }, { it.id })

    private fun pathOrder(target: String, options: NavigationOptions) =
        compareBy<PathCandidate>(
            { candidate -> candidate.edges.count { it.purpose == NavigationRoutePurpose.COVERAGE } },
            { candidate -> candidate.edges.count { it.to in options.avoidPages && it.to != target } },
            { candidate -> candidate.edges.count { edge -> edge.traits.any { it in options.avoidTraits } } },
            { candidate -> candidate.edges.size },
            { candidate -> candidate.edges.sumOf { it.steps.size } },
            { candidate -> candidate.edges.joinToString(">") { it.id } },
        )

    private data class PathCandidate(
        val state: NavigationState,
        val states: List<NavigationState>,
        val edges: List<NavigationEdge>,
        val waypointIndex: Int,
        val waypointPageIndices: Set<Int>,
        val traversedRequiredRoutes: Set<String>,
    ) {
        fun searchState() =
            SearchState(
                navigationState = state,
                waypointIndex = waypointIndex,
                traversedRequiredRoutes = traversedRequiredRoutes,
                hasMoved = edges.isNotEmpty(),
            )
    }

    private data class SearchState(
        val navigationState: NavigationState,
        val waypointIndex: Int,
        val traversedRequiredRoutes: Set<String>,
        val hasMoved: Boolean,
    )

    private companion object {
        const val TAG = "NavigationGraph"
    }
}

/** Represents one distinct navigation path through the graph. */
data class NavigationPath(
    val pages: List<String>,
    val edges: List<NavigationEdge>,
    val states: List<NavigationState> = emptyList(),
    val waypointPageIndices: Set<Int> = emptySet(),
) {
    val totalSteps: Int
        get() = edges.sumOf { it.steps.size }

    val steps: List<NavigationStep>
        get() = edges.flatMap { it.steps }

    internal fun readinessCheckpoints(options: NavigationOptions): List<NavigationCheckpoint> {
        require(states.size == pages.size) { "Navigation path needs one state per page to plan readiness checks" }
        return states.mapIndexed { index, state ->
            val defaultProfile =
                if (index == states.lastIndex || index in waypointPageIndices) {
                    PageReadinessProfile.INTERACTIVE
                } else {
                    PageReadinessProfile.NAVIGATION_READY
                }
            NavigationCheckpoint(
                state = state,
                profile = options.readinessProfileFor(state.page, defaultProfile),
                incomingEdge = edges.getOrNull(index - 1),
                outgoingEdge = edges.getOrNull(index),
                isWaypoint = index in waypointPageIndices,
                isDestination = index == states.lastIndex,
            )
        }
    }
}

data class NavigationGraphDiagnostics(
    val pages: Set<String>,
    val edges: List<NavigationEdge>,
    val nodes: Set<NavigationNode>,
) {
    val zeroStepEdges: List<NavigationEdge>
        get() = edges.filter { it.steps.isEmpty() }
}
