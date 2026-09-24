/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfile
import org.mozilla.fenix.ui.efficiency.navigation.NavigationArrival
import org.mozilla.fenix.ui.efficiency.navigation.NavigationCheckpoint
import org.mozilla.fenix.ui.efficiency.navigation.NavigationEdge
import org.mozilla.fenix.ui.efficiency.navigation.NavigationEffect
import org.mozilla.fenix.ui.efficiency.navigation.NavigationFact
import org.mozilla.fenix.ui.efficiency.navigation.NavigationFacts
import org.mozilla.fenix.ui.efficiency.navigation.NavigationGraph
import org.mozilla.fenix.ui.efficiency.navigation.NavigationNode
import org.mozilla.fenix.ui.efficiency.navigation.NavigationNodeId
import org.mozilla.fenix.ui.efficiency.navigation.NavigationNodeKind
import org.mozilla.fenix.ui.efficiency.navigation.NavigationOptions
import org.mozilla.fenix.ui.efficiency.navigation.NavigationPath
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRouteId
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRouteTrait
import org.mozilla.fenix.ui.efficiency.navigation.NavigationState
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.navigation.PageCatalog
import org.mozilla.fenix.ui.efficiency.navigation.PageObjectKind

@RunWith(AndroidJUnit4::class)
class NavigationGraphContractTest : BaseTest() {
    @Test
    fun graphShapeMatchesTheCharacterizedContract() {
        val diagnostics = on.navigationGraph.diagnostics()

        assertEquals(54, diagnostics.pages.size)
        assertEquals(107, diagnostics.edges.size)
        assertEquals(
            setOf(
                "AddToHomeScreenComponent->BrowserPage",
                "AppEntry->HomePage",
                "AppEntry->OnboardingPage",
                "BrowserPage->ToolbarComponent",
                "CustomTabsPage->BrowserPage",
                "HomePage->ToolbarComponent",
                "MainMenuPage->BrowserPage",
            ),
            diagnostics.zeroStepEdges.map { "${it.from}->${it.to}" }.toSet(),
        )
        assertTrue(diagnostics.zeroStepEdges.all { it.arrival != NavigationArrival.ACTION })
        assertEquals(
            NavigationNodeKind.ENTRY,
            diagnostics.nodes.single { it.id == NavigationNodeId("AppEntry") }.kind,
        )
        assertEquals(
            NavigationNodeKind.EXTERNAL_SURFACE,
            diagnostics.nodes.single { it.id == NavigationNodeId("GooglePlayPage") }.kind,
        )
    }

    @Test
    fun graphConstructionRejectsUndeclaredEndpoints() {
        val builder =
            NavigationGraph.Builder(setOf(NavigationNode(NavigationNodeId("KnownPage"), NavigationNodeKind.PAGE)))
        builder.register("KnownPage", "MissingPage", listOf(NavigationStep.PressBack))

        val failure = runCatching(builder::build).exceptionOrNull()

        assertTrue(failure is IllegalStateException)
        assertTrue(failure?.message.orEmpty().contains("MissingPage"))
    }

    @Test
    fun productionGraphRequiresAnExplicitZeroStepArrival() {
        val builder = NavigationGraph.Builder(emptySet())

        val failure = runCatching { builder.register("SourcePage", "TargetPage", emptyList()) }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
        assertTrue(failure?.message.orEmpty().contains("must declare how arrival is observed"))
    }

    @Test
    fun routeIdentityAndEffectsRemainPartOfTheSelectedPath() {
        val edge =
            on.navigationGraph
                .findPath(
                    "HomePage",
                    "BookmarksPage",
                    NavigationOptions(requiredFacts = setOf(NavigationFacts.BOOKMARKS_HAVE_ITEMS)),
                )
                ?.edges
                ?.single()

        assertEquals(
            NavigationRouteId("HomePage->BookmarksPage#with-searchable-bookmark"),
            edge?.routeId,
        )
        assertTrue(edge?.effects?.single() is NavigationEffect.CreateBookmark)
    }

    @Test
    fun pageContextAndGraphMembershipMatchesTheCharacterizedContract() {
        val context = on
        val pages = PageCatalog.discoverPages()
        val contextPages = pages.map { it.getter(context).pageName }.toSet()
        val navigablePages =
            pages.filter { it.kind == PageObjectKind.NAVIGABLE }.map { it.getter(context).pageName }.toSet()
        val selectorOnlyPages =
            pages.filter { it.kind == PageObjectKind.SELECTOR_ONLY }.map { it.getter(context).pageName }.toSet()
        val graphPages = context.navigationGraph.diagnostics().pages

        assertEquals(setOf("AppEntry", "GooglePlayPage"), graphPages - contextPages)
        assertEquals(setOf("CollectionsPage", "MicrosurveysPage", "ShortcutsPage"), selectorOnlyPages)
        assertEquals(navigablePages, graphPages - setOf("AppEntry", "GooglePlayPage"))
    }

    @Test
    fun navigablePagesDeclareUnambiguousIdentityFingerprints() {
        val context = on
        val fingerprints =
            PageCatalog.discoverNavigablePages()
                .map { it.getter(context) }
                .associate { it.pageName to it.declaredIdentityFingerprint() }
        val ambiguities =
            fingerprints.entries.flatMapIndexed { index, first ->
                fingerprints.entries.drop(index + 1).mapNotNull { second ->
                    when {
                        first.value.isEmpty() || second.value.isEmpty() -> null
                        first.value.containsAll(second.value) -> "${second.key} is a subset of ${first.key}"
                        second.value.containsAll(first.value) -> "${first.key} is a subset of ${second.key}"
                        else -> null
                    }
                }
            }

        assertTrue(
            "Ambiguous page identity fingerprints: ${ambiguities.joinToString()}",
            ambiguities.isEmpty(),
        )
    }

    @Test
    fun duplicateEdgeRegistrationFailsAtGraphConstruction() {
        val builder = NavigationGraph.Builder()
        builder.register("DuplicateSource", "DuplicateTarget", emptyList())

        val failure = runCatching {
            builder.register("DuplicateSource", "DuplicateTarget", emptyList())
        }
            .exceptionOrNull()

        assertTrue(failure is IllegalStateException)
        assertTrue(failure?.message.orEmpty().contains("DuplicateSource->DuplicateTarget"))
    }

    @Test
    fun routeVariantsAreExplicitAndSelectedDeterministically() {
        val path = on.navigationGraph.findPath("HomePage", "SettingsSavedPasswordsPage")

        assertEquals("direct-main-menu", path?.edges?.single()?.variant)
    }

    @Test
    fun samePageNavigationUsesTheRegisteredSelfLoop() {
        assertEquals(
            listOf("BrowserPage->BrowserPage"),
            on.navigationGraph.findPath("BrowserPage", "BrowserPage")?.edges?.map { it.id },
        )
    }

    @Test
    fun navigationSelectsTheLeastDestructiveEquallyDirectPath() {
        val path = on.navigationGraph.findPath("BrowserPage", "HistoryPage")

        assertEquals(
            listOf("BrowserPage->MainMenuPage", "MainMenuPage->HistoryPage"),
            path?.edges?.map { it.id },
        )
        assertEquals(2, path?.totalSteps)
    }

    @Test
    fun browserPageIsOnlyUsedAsTransitWhenNoBrowserFreePathExists() {
        val graph = syntheticGraph {
            register("TransitSource", "BrowserPage", emptyList())
            register("BrowserPage", "TransitTarget", emptyList())
            register("TransitSource", "SafeMiddle", emptyList())
            register("SafeMiddle", "TransitTarget", emptyList())
            register("BrowserPage", "BrowserOnlyTarget", emptyList())
        }

        assertEquals(
            listOf("TransitSource", "SafeMiddle", "TransitTarget"),
            graph.findPath("TransitSource", "TransitTarget")?.pages,
        )
        assertEquals(
            listOf("TransitSource", "BrowserPage"),
            graph.findPath("TransitSource", "BrowserPage")?.pages,
        )
        assertEquals(
            listOf("TransitSource", "BrowserPage", "BrowserOnlyTarget"),
            graph.findPath("TransitSource", "BrowserOnlyTarget")?.pages,
        )
    }

    @Test
    fun navigationOptionsConstrainPagesAndRoutes() {
        val graph = syntheticGraph {
            register("ConstraintSource", "ConstraintTarget", emptyList())
            register("ConstraintSource", "ConstraintWaypoint", emptyList())
            register("ConstraintWaypoint", "ConstraintTarget", emptyList())
        }

        assertEquals(
            listOf("ConstraintSource", "ConstraintWaypoint", "ConstraintTarget"),
            graph
                .findPath(
                    from = "ConstraintSource",
                    to = "ConstraintTarget",
                    options = NavigationOptions(via = listOf("ConstraintWaypoint")),
                )
                ?.pages,
        )
        assertEquals(
            listOf("ConstraintSource", "ConstraintWaypoint", "ConstraintTarget"),
            graph
                .findPath(
                    from = "ConstraintSource",
                    to = "ConstraintTarget",
                    options = NavigationOptions(excludedRoutes = setOf("ConstraintSource->ConstraintTarget")),
                )
                ?.pages,
        )
        assertEquals(
            listOf("ConstraintSource", "ConstraintTarget"),
            graph
                .findPath(
                    from = "ConstraintSource",
                    to = "ConstraintTarget",
                    options = NavigationOptions(excludedPages = setOf("ConstraintWaypoint")),
                )
                ?.pages,
        )
        assertEquals(
            setOf(1),
            graph
                .findPath(
                    from = "ConstraintSource",
                    to = "ConstraintTarget",
                    options = NavigationOptions(via = listOf("ConstraintWaypoint")),
                )
                ?.waypointPageIndices,
        )
    }

    @Test
    fun navigationOptionsCanRequireRoutesAndAvoidTraits() {
        val disruptive = NavigationRouteTrait("DISRUPTIVE")
        val graph = syntheticGraph {
            register(
                from = "PolicySource",
                to = "PolicyRisky",
                steps = emptyList(),
                traits = setOf(disruptive),
            )
            register("PolicyRisky", "PolicyTarget", emptyList())
            register("PolicySource", "PolicySafe", emptyList())
            register("PolicySafe", "PolicyTarget", emptyList())
        }

        assertEquals(
            listOf("PolicySource", "PolicySafe", "PolicyTarget"),
            graph
                .findPath(
                    from = "PolicySource",
                    to = "PolicyTarget",
                    options = NavigationOptions(avoidTraits = setOf(disruptive)),
                )
                ?.pages,
        )
        assertEquals(
            listOf("PolicySource", "PolicyRisky", "PolicyTarget"),
            graph
                .findPath(
                    from = "PolicySource",
                    to = "PolicyTarget",
                    options = NavigationOptions(requiredRoutes = setOf("PolicySource->PolicyRisky")),
                )
                ?.pages,
        )
    }

    @Test
    fun readinessPlanChecksEveryVisitedPage() {
        val states =
            listOf("Start", "Intermediate", "Waypoint", "Destination").map {
                NavigationState(NavigationNodeId(it))
            }
        val edges = states.zipWithNext { from, to ->
            NavigationEdge(source = from.node, target = to.node, steps = emptyList())
        }
        val path =
            NavigationPath(
                pages = states.map { it.page },
                edges = edges,
                states = states,
                waypointPageIndices = setOf(2),
            )

        val checkpoints =
            path.readinessCheckpoints(
                NavigationOptions(readinessProfiles = mapOf("Intermediate" to PageReadinessProfile.IDENTIFIED))
            )

        assertEquals(states, checkpoints.map { it.state })
        assertEquals(
            listOf(
                PageReadinessProfile.NAVIGATION_READY,
                PageReadinessProfile.IDENTIFIED,
                PageReadinessProfile.INTERACTIVE,
                PageReadinessProfile.INTERACTIVE,
            ),
            checkpoints.map { it.profile },
        )
        assertEquals(listOf(null) + edges, checkpoints.map { it.incomingEdge })
        assertEquals(edges + null, checkpoints.map { it.outgoingEdge })
        assertEquals(listOf(false, false, true, false), checkpoints.map { it.isWaypoint })
        assertEquals(listOf(false, false, false, true), checkpoints.map { it.isDestination })
    }

    @Test
    fun checkpointVerifierReceivesThePlannedStateAndProfile() {
        val expected =
            NavigationCheckpoint(
                NavigationState(NavigationNodeId("CheckpointPage"), setOf(NavigationFact("READY"))),
                PageReadinessProfile.NAVIGATION_READY,
            )
        var received: NavigationCheckpoint? = null
        val graph =
            NavigationGraph.Builder()
                .apply {
                    register("CheckpointPage", "CheckpointTarget", emptyList())
                    registerCheckpointVerifier("CheckpointPage") {
                        received = it
                        true
                    }
                }
                .build()

        assertTrue(graph.verifyCheckpoint(expected))
        assertEquals(expected, received)
    }

    @Test
    fun searchDistinguishesTheSamePageWithDifferentFacts() {
        val unlocked = NavigationFact("UNLOCKED")
        val graph = syntheticGraph {
            register("StateSource", "StateJoin", emptyList())
            register(
                from = "StateSource",
                to = "StateProvider",
                steps = emptyList(),
                provides = setOf(unlocked),
            )
            register("StateProvider", "StateJoin", emptyList())
            register(
                from = "StateJoin",
                to = "StateTarget",
                steps = emptyList(),
                requires = setOf(unlocked),
            )
        }

        val path = graph.findPath("StateSource", "StateTarget")

        assertEquals(listOf("StateSource", "StateProvider", "StateJoin", "StateTarget"), path?.pages)
        assertEquals(setOf(unlocked), path?.states?.last()?.facts)
    }

    @Test
    fun navigationFactsSupportGoalRequirementsAndRouteGuards() {
        val authorized = NavigationFact("AUTHORIZED")
        val graph = syntheticGraph {
            register("FactSource", "FactTarget", emptyList())
            register(
                from = "FactSource",
                to = "FactProvider",
                steps = emptyList(),
                provides = setOf(authorized),
            )
            register("FactProvider", "FactTarget", emptyList())
            register(
                from = "FactProvider",
                to = "ForbiddenTarget",
                steps = emptyList(),
                forbids = setOf(authorized),
            )
            register(
                from = "FactProvider",
                to = "FactRevoker",
                steps = emptyList(),
                invalidates = setOf(authorized),
            )
            register(
                from = "FactRevoker",
                to = "GuardedTarget",
                steps = emptyList(),
                requires = setOf(authorized),
            )
        }

        assertEquals(
            listOf("FactSource", "FactProvider", "FactTarget"),
            graph
                .findPath(
                    from = "FactSource",
                    to = "FactTarget",
                    options = NavigationOptions(requiredFacts = setOf(authorized)),
                )
                ?.pages,
        )
        assertNull(graph.findPath("FactSource", "ForbiddenTarget"))
        assertNull(graph.findPath("FactSource", "GuardedTarget"))
    }

    @Test
    fun settingsReturnToTheSurfaceThatOpenedThem() {
        assertEquals(
            listOf(
                "SettingsCustomizePage->SettingsPage",
                "SettingsPage->HomePage",
                "HomePage->BrowserPage",
            ),
            on.navigationGraph
                .findPath(
                    from = "SettingsCustomizePage",
                    to = "BrowserPage",
                    initialFacts = setOf(NavigationFacts.RETURN_SURFACE_HOME),
                )
                ?.edges
                ?.map { it.id },
        )
        assertEquals(
            listOf(
                "SettingsCustomizePage->SettingsPage",
                "SettingsPage->BrowserPage",
            ),
            on.navigationGraph
                .findPath(
                    from = "SettingsCustomizePage",
                    to = "BrowserPage",
                    initialFacts = setOf(NavigationFacts.RETURN_SURFACE_BROWSER),
                )
                ?.edges
                ?.map { it.id },
        )
    }

    private fun syntheticGraph(configure: NavigationGraph.Builder.() -> Unit): NavigationGraph =
        NavigationGraph.Builder().apply(configure).build()
}
