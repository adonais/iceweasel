/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.lint

import com.android.tools.lint.client.api.UElementHandler
import com.android.tools.lint.detector.api.Category
import com.android.tools.lint.detector.api.Detector
import com.android.tools.lint.detector.api.Implementation
import com.android.tools.lint.detector.api.Issue
import com.android.tools.lint.detector.api.JavaContext
import com.android.tools.lint.detector.api.Scope
import com.android.tools.lint.detector.api.Severity
import com.android.tools.lint.detector.api.SourceCodeScanner
import com.android.tools.lint.detector.api.TextFormat
import com.intellij.psi.PsiQualifiedNamedElement
import org.jetbrains.uast.UBlockExpression
import org.jetbrains.uast.UCallExpression
import org.jetbrains.uast.UElement
import org.jetbrains.uast.UExpression
import org.jetbrains.uast.ULambdaExpression
import org.jetbrains.uast.UMethod
import org.jetbrains.uast.UQualifiedReferenceExpression
import org.jetbrains.uast.UReturnExpression
import org.jetbrains.uast.UastCallKind
import org.jetbrains.uast.skipParenthesizedExprDown
import org.jetbrains.uast.tryResolve
import org.jetbrains.uast.visitor.AbstractUastVisitor
import kotlin.contracts.ExperimentalContracts
import kotlin.contracts.contract

/**
 * Detects when `Fragment.onCreateView` directly returns a `ComposeView` and suggests
 * using `Fragment.content {}` from `androidx.fragment:fragment-compose` instead.
 *
 * In the simple case where it can detect that the required `ViewCompositionStrategy`
 * isn't missing, it only reports a warning (i.e. you won't get backed out).
 * If it's more complicated or the `ViewCompositionStrategy` is actually missing, it's an error.
 */
class FragmentComposeViewDetector : Detector(), SourceCodeScanner {

    companion object {
        private val Implementation = Implementation(
            FragmentComposeViewDetector::class.java,
            Scope.JAVA_FILE_SCOPE,
        )

        private val ISSUE_MISSING_VIEW_COMPOSITION_STRATEGY: Issue = Issue.create(
            id = "MissingViewCompositionStrategy",
            briefDescription = """
                Use `content {}` to avoid a memory leak caused by missing \
                `setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)`.
            """.trimIndent(),
            explanation = """
                When a `ComposeView` is returned from `onCreateView()` without calling \
                `setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)`, \
                the composition is not disposed when the `Fragment`'s view is destroyed, \
                which can leak memory. Prefer `Fragment.content {}` from \
                `androidx.fragment:fragment-compose`, which sets the correct strategy \
                automatically.
            """.trimIndent(),
            category = Category.CORRECTNESS,
            priority = 6,
            severity = Severity.ERROR,
            implementation = Implementation,
        )

        private val ISSUE_USE_FRAGMENT_CONTENT: Issue = Issue.create(
            id = "UseFragmentContent",
            briefDescription = """
                Prefer `content {}` instead of manually constructing a `ComposeView` \
                in `onCreateView()`.
            """.trimIndent(),
            explanation = """
                Manually creating a `ComposeView` requires boilerplate, e.g setting the correct \
                `ViewCompositionStrategy`. Forgetting it can result in memory leaks. \
                `Fragment.content {}` extension function from `androidx.fragment:fragment-compose` \
                is less verbose and helps to avoid this foot-gun.
            """.trimIndent(),
            category = Category.CORRECTNESS,
            priority = 6,
            severity = Severity.WARNING,
            implementation = Implementation,
        )

        val ISSUES = listOf(ISSUE_MISSING_VIEW_COMPOSITION_STRATEGY, ISSUE_USE_FRAGMENT_CONTENT)
    }

    override fun getApplicableUastTypes(): List<Class<out UElement>> = listOf(UMethod::class.java)

    override fun createUastHandler(context: JavaContext): UElementHandler {
        return object : UElementHandler() {
            override fun visitMethod(node: UMethod) {
                if (node.name == "onCreateView" &&
                    context.evaluator.isMemberInSubClassOf(node, "androidx.fragment.app.Fragment")
                ) {
                    node.uastBody?.accept(OnCreateViewVisitor(context))
                }
            }
        }
    }

    private class OnCreateViewVisitor(private val context: JavaContext) : AbstractUastVisitor() {
        override fun visitReturnExpression(node: UReturnExpression): Boolean {
            val composeViewConstructor: UCallExpression?
            val missingViewCompositionStrategy: Boolean

            val returned = node.returnExpression?.skipParenthesizedExprDown()?.skipQualifiedName()
            if (returned.isComposeViewConstructor()) {
                composeViewConstructor = returned
                missingViewCompositionStrategy = true
            } else {
                val receiver = (returned as? UQualifiedReferenceExpression)?.receiver
                    ?.skipParenthesizedExprDown()
                    ?.skipQualifiedName()
                val selector = (returned as? UQualifiedReferenceExpression)?.selector
                if (receiver.isComposeViewConstructor() && selector.isApply()) {
                    composeViewConstructor = receiver
                    missingViewCompositionStrategy = !selector.hasCorrectViewCompositionStrategy()
                } else {
                    composeViewConstructor = null
                    missingViewCompositionStrategy = true
                }
            }

            if (composeViewConstructor != null) {
                val issue = if (missingViewCompositionStrategy) {
                    ISSUE_MISSING_VIEW_COMPOSITION_STRATEGY
                } else {
                    ISSUE_USE_FRAGMENT_CONTENT
                }
                context.report(
                    issue = issue,
                    scope = composeViewConstructor,
                    location = context.getCallLocation(
                        call = composeViewConstructor,
                        includeReceiver = false,
                        includeArguments = false,
                    ),
                    message = issue.getBriefDescription(TextFormat.TEXT),
                )
            }
            return false
        }

        override fun visitLambdaExpression(node: ULambdaExpression): Boolean {
            // Avoid descending into lambdas: a `return` inside a lambda is not a
            // return from `onCreateView`.
            return true
        }

        @OptIn(ExperimentalContracts::class)
        private fun UExpression?.isComposeViewConstructor(): Boolean {
            contract {
                returns(true) implies (this@isComposeViewConstructor is UCallExpression)
            }
            return this is UCallExpression &&
                kind == UastCallKind.CONSTRUCTOR_CALL &&
                resolve()?.containingClass?.qualifiedName == "androidx.compose.ui.platform.ComposeView"
        }

        @OptIn(ExperimentalContracts::class)
        private fun UExpression?.isApply(): Boolean {
            contract {
                returns(true) implies (this@isApply is UCallExpression)
            }
            return this is UCallExpression &&
                methodName == "apply" &&
                resolve()?.containingClass?.qualifiedName.orEmpty().startsWith("kotlin.Standard")
        }

        private fun UCallExpression.hasCorrectViewCompositionStrategy(): Boolean {
            val lambda = valueArguments.lastOrNull() as? ULambdaExpression
            val body = lambda?.body as? UBlockExpression
            return body?.expressions.orEmpty()
                .map { it.skipParenthesizedExprDown().skipQualifiedName().skipReturn() }
                .filterIsInstance<UCallExpression>()
                .any { it.isCorrectSetViewCompositionStrategy() }
        }

        private fun UCallExpression.isCorrectSetViewCompositionStrategy(): Boolean {
            return methodName == "setViewCompositionStrategy" &&
                resolve()?.containingClass?.qualifiedName == "androidx.compose.ui.platform.AbstractComposeView" &&
                valueArguments.singleOrNull()?.isDisposeOnViewTreeLifecycleDestroyed() == true
        }

        /**
         * `DisposeOnViewTreeLifecycleDestroyed` is a Kotlin `object`, so any reference to
         * it has the singleton class itself as its expression type.
         */
        private fun UExpression.isDisposeOnViewTreeLifecycleDestroyed(): Boolean {
            return getExpressionType()?.canonicalText ==
                "androidx.compose.ui.platform.ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed"
        }

        private fun UExpression.skipQualifiedName(): UExpression {
            return if (this is UQualifiedReferenceExpression &&
                receiver.tryResolve() is PsiQualifiedNamedElement
            ) {
                selector
            } else {
                this
            }
        }

        private fun UExpression.skipReturn(): UExpression? {
            return when (this) {
                is UReturnExpression -> returnExpression
                else -> this
            }
        }
    }
}
