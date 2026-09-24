/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import org.mozilla.fenix.ui.efficiency.navigation.NavigationEdge
import org.mozilla.fenix.ui.efficiency.navigation.NavigationState

enum class PageReadinessProfile {
    IDENTIFIED,
    NAVIGATION_READY,
    INTERACTIVE,
}

object PageReadinessProfiles {
    val IDENTITY_ANCHOR = PageReadinessProfile.entries.toSet()
    val READY_CONTENT = setOf(PageReadinessProfile.NAVIGATION_READY, PageReadinessProfile.INTERACTIVE)
}

data class PageReadinessContext(
    val page: String,
    val profile: PageReadinessProfile,
    val navigationState: NavigationState,
    val incomingEdge: NavigationEdge? = null,
    val outgoingEdge: NavigationEdge? = null,
    val isWaypoint: Boolean = false,
    val isDestination: Boolean = false,
)

sealed interface PageReadinessCondition {
    data class Visible(val selector: Selector) : PageReadinessCondition

    data class AllOf(val conditions: List<PageReadinessCondition>) : PageReadinessCondition {
        init {
            require(conditions.isNotEmpty()) { "AllOf readiness conditions cannot be empty" }
        }
    }

    data class AnyOf(val conditions: List<PageReadinessCondition>) : PageReadinessCondition {
        init {
            require(conditions.isNotEmpty()) { "AnyOf readiness conditions cannot be empty" }
        }
    }

    companion object {
        fun allOf(vararg selectors: Selector): PageReadinessCondition = AllOf(selectors.map(::Visible))

        fun anyOf(vararg selectors: Selector): PageReadinessCondition = AnyOf(selectors.map(::Visible))
    }
}

data class PageReadinessRule(
    val name: String,
    val profiles: Set<PageReadinessProfile>,
    val condition: PageReadinessCondition,
    val appliesWhen: (PageReadinessContext) -> Boolean = { true },
) {
    init {
        require(name.isNotBlank()) { "Readiness rule name cannot be blank" }
        require(profiles.isNotEmpty()) { "Readiness rule profiles cannot be empty" }
    }
}

data class PageReadinessEvaluation(
    val satisfied: Boolean,
    val appliedRules: List<String>,
    val skippedRules: List<String>,
    val missingSelectors: List<String>,
    val predicateFailures: List<String>,
) {
    val hasContract: Boolean
        get() = appliedRules.isNotEmpty()
}

/**
 * A live page oracle whose rules may vary with navigation state and route context.
 *
 * Evaluation is deliberately non-vacuous and delegates each selector probe to the caller, so polling observes current
 * UI state instead of approving a cached hierarchy for a later interaction.
 */
class PageReadinessContract private constructor(private val rules: List<PageReadinessRule>) {
    val declaredProfiles: Set<PageReadinessProfile>
        get() = rules.flatMapTo(mutableSetOf()) { it.profiles }

    fun declaredSelectors(profile: PageReadinessProfile): Set<Selector> =
        rules
            .asSequence()
            .filter { profile in it.profiles }
            .flatMap { it.condition.declaredSelectors() }
            .toCollection(linkedSetOf())

    fun withRule(rule: PageReadinessRule): PageReadinessContract = PageReadinessContract(rules + rule)

    fun evaluate(
        context: PageReadinessContext,
        isVisible: (Selector) -> Boolean,
    ): PageReadinessEvaluation {
        val applied = mutableListOf<PageReadinessRule>()
        val skipped = mutableListOf<String>()
        val predicateFailures = mutableListOf<String>()

        rules
            .filter { context.profile in it.profiles }
            .forEach { rule ->
                runCatching { rule.appliesWhen(context) }
                    .onSuccess { applies ->
                        if (applies) applied += rule else skipped += rule.name
                    }
                    .onFailure { error ->
                        predicateFailures += "${rule.name}: ${error.message ?: error::class.java.simpleName}"
                    }
            }

        val evaluations = applied.map { evaluateCondition(it.condition, isVisible) }
        val missing = evaluations.flatMap { it.missingSelectors }.distinct()
        val satisfied = applied.isNotEmpty() && predicateFailures.isEmpty() && evaluations.all { it.satisfied }

        return PageReadinessEvaluation(
            satisfied = satisfied,
            appliedRules = applied.map { it.name },
            skippedRules = skipped,
            missingSelectors = missing,
            predicateFailures = predicateFailures,
        )
    }

    companion object {
        fun fromSelectors(selectors: List<Selector>): PageReadinessContract {
            val rules =
                PageReadinessProfile.entries.mapNotNull { profile ->
                    val required = selectors.filter { profile in it.readiness }
                    if (required.isEmpty()) {
                        null
                    } else {
                        PageReadinessRule(
                            name = "declared-${profile.name.lowercase()}",
                            profiles = setOf(profile),
                            condition = PageReadinessCondition.allOf(*required.toTypedArray()),
                        )
                    }
                }
            return PageReadinessContract(rules)
        }
    }
}

private fun PageReadinessCondition.declaredSelectors(): Sequence<Selector> =
    when (this) {
        is PageReadinessCondition.Visible -> sequenceOf(selector)
        is PageReadinessCondition.AllOf -> conditions.asSequence().flatMap { it.declaredSelectors() }
        is PageReadinessCondition.AnyOf -> conditions.asSequence().flatMap { it.declaredSelectors() }
    }

private data class ConditionEvaluation(
    val satisfied: Boolean,
    val missingSelectors: List<String>,
)

private fun evaluateCondition(
    condition: PageReadinessCondition,
    isVisible: (Selector) -> Boolean,
): ConditionEvaluation =
    when (condition) {
        is PageReadinessCondition.Visible -> {
            val visible = isVisible(condition.selector)
            ConditionEvaluation(visible, if (visible) emptyList() else listOf(condition.selector.description))
        }
        is PageReadinessCondition.AllOf -> {
            val children = condition.conditions.map { evaluateCondition(it, isVisible) }
            ConditionEvaluation(children.all { it.satisfied }, children.flatMap { it.missingSelectors })
        }
        is PageReadinessCondition.AnyOf -> {
            val children = condition.conditions.map { evaluateCondition(it, isVisible) }
            val satisfied = children.any { it.satisfied }
            ConditionEvaluation(satisfied, if (satisfied) emptyList() else children.flatMap { it.missingSelectors })
        }
    }
