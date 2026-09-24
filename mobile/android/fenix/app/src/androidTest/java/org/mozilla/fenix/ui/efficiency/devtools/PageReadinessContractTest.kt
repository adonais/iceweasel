/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessCondition
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessContext
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessContract
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfile
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessRule
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.navigation.NavigationEdge
import org.mozilla.fenix.ui.efficiency.navigation.NavigationFact
import org.mozilla.fenix.ui.efficiency.navigation.NavigationNodeId
import org.mozilla.fenix.ui.efficiency.navigation.NavigationState

class PageReadinessContractTest {
    @Test
    fun selectorProfilesBuildIndependentContracts() {
        val identity = selector("identity", PageReadinessProfiles.IDENTITY_ANCHOR)
        val settled = selector("settled", PageReadinessProfiles.READY_CONTENT)
        val contract = PageReadinessContract.fromSelectors(listOf(identity, settled))

        assertTrue(contract.evaluate(context(PageReadinessProfile.IDENTIFIED)) { it == identity }.satisfied)
        assertFalse(contract.evaluate(context(PageReadinessProfile.NAVIGATION_READY)) { it == identity }.satisfied)
        assertTrue(contract.evaluate(context(PageReadinessProfile.NAVIGATION_READY)) { true }.satisfied)
    }

    @Test
    fun allOfChecksEverySelectorAndReportsEveryMissingSelector() {
        val first = selector("first")
        val second = selector("second")
        val observed = mutableListOf<Selector>()
        val contract =
            PageReadinessContract.fromSelectors(emptyList()).withRule(rule(PageReadinessCondition.allOf(first, second)))

        val result =
            contract.evaluate(context()) {
                observed += it
                false
            }

        assertEquals(listOf(first, second), observed)
        assertEquals(listOf("first", "second"), result.missingSelectors)
    }

    @Test
    fun anyOfAcceptsOneLiveAlternative() {
        val emptyState = selector("empty state")
        val populatedState = selector("populated state")
        val contract =
            PageReadinessContract.fromSelectors(emptyList())
                .withRule(rule(PageReadinessCondition.anyOf(emptyState, populatedState)))

        val result = contract.evaluate(context()) { it == populatedState }

        assertTrue(result.satisfied)
        assertTrue(result.missingSelectors.isEmpty())
    }

    @Test
    fun declaredSelectorsIncludeCustomRuleAlternatives() {
        val identity = selector("identity", PageReadinessProfiles.IDENTITY_ANCHOR)
        val emptyState = selector("empty state")
        val populatedState = selector("populated state")
        val contract =
            PageReadinessContract.fromSelectors(listOf(identity))
                .withRule(
                    PageReadinessRule(
                        name = "content-state",
                        profiles = setOf(PageReadinessProfile.IDENTIFIED),
                        condition = PageReadinessCondition.anyOf(emptyState, populatedState),
                    )
                )

        assertEquals(
            setOf(identity, emptyState, populatedState),
            contract.declaredSelectors(PageReadinessProfile.IDENTIFIED),
        )
    }

    @Test
    fun conditionalRulesUseThePlannedNavigationState() {
        val signedIn = NavigationFact("SIGNED_IN")
        val accountControl = selector("account control")
        val base = selector("base", setOf(PageReadinessProfile.NAVIGATION_READY))
        val contract =
            PageReadinessContract.fromSelectors(listOf(base))
                .withRule(
                    PageReadinessRule(
                        name = "signed-in-account-control",
                        profiles = setOf(PageReadinessProfile.NAVIGATION_READY),
                        condition = PageReadinessCondition.allOf(accountControl),
                        appliesWhen = { signedIn in it.navigationState.facts },
                    )
                )

        val signedOutResult = contract.evaluate(context()) { it == base }
        val signedInResult = contract.evaluate(context(facts = setOf(signedIn))) { it == base }

        assertTrue(signedOutResult.satisfied)
        assertEquals(listOf("signed-in-account-control"), signedOutResult.skippedRules)
        assertFalse(signedInResult.satisfied)
        assertEquals(listOf("account control"), signedInResult.missingSelectors)
    }

    @Test
    fun conditionalRulesUseThePlannedOutgoingEdge() {
        val directTarget = selector("direct target")
        val base = selector("base", setOf(PageReadinessProfile.NAVIGATION_READY))
        val edge =
            NavigationEdge(
                NavigationNodeId("TestPage"),
                NavigationNodeId("TargetPage"),
                emptyList(),
            )
        val contract =
            PageReadinessContract.fromSelectors(listOf(base))
                .withRule(
                    PageReadinessRule(
                        name = "route-specific-target",
                        profiles = setOf(PageReadinessProfile.NAVIGATION_READY),
                        condition = PageReadinessCondition.allOf(directTarget),
                        appliesWhen = { it.outgoingEdge?.to == "TargetPage" },
                    )
                )

        val withoutRoute = contract.evaluate(context()) { it == base }
        val withRoute = contract.evaluate(context(outgoingEdge = edge)) { it == base }

        assertTrue(withoutRoute.satisfied)
        assertEquals(listOf("route-specific-target"), withoutRoute.skippedRules)
        assertFalse(withRoute.satisfied)
        assertEquals(listOf("direct target"), withRoute.missingSelectors)
    }

    @Test
    fun profileWithoutAnApplicableRuleIsNotReady() {
        val result = PageReadinessContract.fromSelectors(emptyList()).evaluate(context()) { true }

        assertFalse(result.hasContract)
        assertFalse(result.satisfied)
    }

    private fun selector(
        description: String,
        readiness: Set<PageReadinessProfile> = emptySet(),
    ) =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = description,
            description = description,
            readiness = readiness,
        )

    private fun rule(condition: PageReadinessCondition) =
        PageReadinessRule(
            name = "test-rule",
            profiles = setOf(PageReadinessProfile.NAVIGATION_READY),
            condition = condition,
        )

    private fun context(
        profile: PageReadinessProfile = PageReadinessProfile.NAVIGATION_READY,
        facts: Set<NavigationFact> = emptySet(),
        outgoingEdge: NavigationEdge? = null,
    ) =
        PageReadinessContext(
            "TestPage",
            profile,
            NavigationState(NavigationNodeId("TestPage"), facts),
            outgoingEdge = outgoingEdge,
        )
}
