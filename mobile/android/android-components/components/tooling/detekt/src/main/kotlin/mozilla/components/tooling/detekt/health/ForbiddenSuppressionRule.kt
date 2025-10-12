/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.detekt.health

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Finding
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Location
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.RuleSetId
import io.gitlab.arturbosch.detekt.api.Severity
import io.gitlab.arturbosch.detekt.api.config
import org.jetbrains.kotlin.psi.KtAnnotationEntry
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtCollectionLiteralExpression
import org.jetbrains.kotlin.psi.KtExpression
import org.jetbrains.kotlin.psi.KtStringTemplateExpression

/**
 * Detekt rule to report whether a forbidden rule has been suppressed.
 *
 * The goal of this rule is to have some rules that we never want to suppress. This is a bit recursive
 * because we also do not want this rule to be suppressed.
 *
 * Usage:
 *
 * Add these lines to your detekt config yml file:
 *
 * ```yaml
 * mozilla-rules:
 *   ForbiddenSuppression:
 *     active: true
 *     # includeSelf means that a violation will be reported if ForbiddenSuppression is suppressed
 *     # default value is true.
 *     includeSelf: true
 *     forbiddenSuppressions:
 *       - 'ForbiddenRule1'
 *       - 'ForbiddenRule2'
 * ```
 */
class ForbiddenSuppressionRule(config: Config = Config.empty) : Rule(config) {

    /**
     * We are manually keeping track of the findings because we want to prevent this rule from being
     * suppressed, and detekt avoids reporting suppressed findings.
     */
    private val _findings: MutableList<Finding> = mutableListOf()
    override val findings: List<Finding>
        get() = _findings

    /**
     * Config indicating whether or not to include this rule as part of the forbidden suppressions
     *
     * Default value is true.
     */
    private val includeSelf: Boolean by config(defaultValue = true)

    /**
     * Config indicating the forbidden suppression. This is applied as a list in the configuration
     * but treated as a set internally for quick checks of violations.
     */
    private val forbiddenSuppressions: Set<String> by config(emptyList<String>()) {
        buildSet {
            addAll(it)
            if (includeSelf) {
                add(issue.id)
            }
        }
    }

    override val issue: Issue
        get() = Issue(
            id = "ForbiddenSuppression",
            severity = Severity.CodeSmell,
            description = "Forbidden suppression has been detected.",
            debt = Debt.TWENTY_MINS,
        )

    override fun visitAnnotationEntry(annotationEntry: KtAnnotationEntry) {
        super.visitAnnotationEntry(annotationEntry)

        val annotation = annotationEntry.shortName?.identifier ?: return

        val supportedAnnotations = setOf("Suppress", "SuppressWarnings")
        if (annotation !in supportedAnnotations) return

        val annotationArgs = annotationEntry.valueArguments.mapNotNull { arg ->
            arg.getArgumentExpression()?.getArguments()
        }.flatten().toSet()

        val violations = annotationArgs.intersect(forbiddenSuppressions)

        if (violations.isNotEmpty()) {
            val location = Location.from(annotationEntry)
            report(
                finding = CodeSmell(
                    issue = issue,
                    entity = Entity.from(
                        annotationEntry,
                        location,
                    ),
                    message = buildString {
                        append("Suppressing ${violations.joinToString(",") { it.trim() }} ")
                        append("has been forbidden. Please consider fixing the issue(s) instead of suppressing it")
                    },
                ),
            )
        }
    }

    override fun report(finding: Finding, aliases: Set<String>, ruleSetId: RuleSetId?) {
        _findings.add(finding)
    }

    override fun clearFindings() {
        _findings.clear()
        super.clearFindings()
    }

    private fun KtExpression.getArguments(): List<String>? {
        return when (this) {
            is KtStringTemplateExpression -> {
                this.entries.mapNotNull { it.text }.joinToString("")
                    .removeSurrounding("\"")
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
            }

            is KtCollectionLiteralExpression -> {
                this.innerExpressions.mapNotNull { it.getArguments() }.flatten()
            }

            is KtCallExpression -> {
                valueArguments.mapNotNull { callArgument ->
                    callArgument.getArgumentExpression()?.getArguments()
                }.flatten()
            }

            else -> null
        }
    }
}
