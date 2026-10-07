/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.lint

import com.android.ide.common.rendering.api.ResourceNamespace
import com.android.resources.ResourceType
import com.android.tools.lint.client.api.ResourceRepositoryScope
import com.android.tools.lint.detector.api.Category
import com.android.tools.lint.detector.api.ConstantEvaluator
import com.android.tools.lint.detector.api.Detector
import com.android.tools.lint.detector.api.Implementation
import com.android.tools.lint.detector.api.Issue
import com.android.tools.lint.detector.api.JavaContext
import com.android.tools.lint.detector.api.ResourceEvaluator
import com.android.tools.lint.detector.api.Scope
import com.android.tools.lint.detector.api.Severity
import com.android.tools.lint.detector.api.SourceCodeScanner
import com.intellij.psi.PsiMethod
import org.jetbrains.uast.UCallExpression
import org.jetbrains.uast.UExpression
import org.jetbrains.uast.UThisExpression
import org.jetbrains.uast.getContainingUClass
import org.jetbrains.uast.skipParenthesizedExprDown

private const val CONSTRAINT_LAYOUT = "androidx.constraintlayout.widget.ConstraintLayout"
private const val VIEW = "android.view.View"
private const val LAYOUT_INFLATER = "android.view.LayoutInflater"
private const val VIEW_BINDING = "androidx.viewbinding.ViewBinding"

private val UPPERCASE_BOUNDARY = Regex("(?<=.)(?=[A-Z])")

private const val ISSUE_MESSAGE =
    "This `ConstraintLayout` inflates a layout rooted in another `ConstraintLayout` into itself, so it pays for " +
        "two. Root the layout in `<merge>` with `tools:parentTag` instead."

/**
 * Reports a view that extends ConstraintLayout and inflates a layout whose root is another ConstraintLayout into
 * itself. Every instance of such a view is two ConstraintLayouts where one would do, and no check that reads one file
 * at a time can see it: the view is in a Kotlin file and the root it inflates is in a layout.
 *
 * The inflation is recognised in the three forms we write it: a view binding's `inflate`, `View.inflate`, and
 * `LayoutInflater.inflate`, in each case with the view itself as the parent and attached to it. The layout is looked up
 * in the view's own module, which is where every view of ours keeps it.
 */
class ConstraintLayoutInflationDetector : Detector(), SourceCodeScanner {

    companion object {
        val ISSUE =
            Issue.create(
                id = "MozConstraintLayoutInflatesConstraintLayout",
                briefDescription = "A ConstraintLayout inflating a second ConstraintLayout into itself",
                explanation =
                    """
                    A view that extends `ConstraintLayout` and inflates a layout rooted in a `ConstraintLayout` \
                    into itself creates two of them for every instance, one nested directly inside the other. \
                    The inner one adds nothing but its own inflation and measurement cost.

                    Root the inflated layout in `<merge>` and give it `tools:parentTag` so the layout editor \
                    still knows what the children are laid out in. The children then attach straight to the \
                    view, and any `minHeight`, `background` or padding the discarded root carried moves onto \
                    the view itself.
                    """
                        .trimIndent(),
                category = Category.PERFORMANCE,
                priority = 8,
                severity = Severity.ERROR,
                implementation =
                    Implementation(
                        ConstraintLayoutInflationDetector::class.java,
                        Scope.JAVA_FILE_SCOPE,
                    ),
            )
    }

    override fun getApplicableMethodNames(): List<String> = listOf("inflate")

    override fun visitMethodCall(context: JavaContext, node: UCallExpression, method: PsiMethod) {
        val containingClass = node.getContainingUClass()?.javaPsi ?: return
        if (!context.evaluator.extendsClass(containingClass, CONSTRAINT_LAYOUT, false)) return

        val layout = inflatedLayoutName(context, node, method) ?: return
        if (layoutRootTags(context, layout).any { it in CONSTRAINT_LAYOUT_ELEMENTS }) {
            context.report(ISSUE, node, context.getCallLocation(node, false, true), ISSUE_MESSAGE)
        }
    }

    /**
     * The layout this call inflates into the view itself, or null if it is not one of the inflation forms we look for
     * or does not attach to the view.
     */
    private fun inflatedLayoutName(context: JavaContext, node: UCallExpression, method: PsiMethod): String? {
        val evaluator = context.evaluator
        val owner = method.containingClass ?: return null
        val args = node.valueArguments
        val (first, second, third) = Triple(args.getOrNull(0), args.getOrNull(1), args.getOrNull(2))

        return when {
            evaluator.implementsInterface(owner, VIEW_BINDING, false) ->
                bindingLayoutName(owner.name.orEmpty()).takeIf { attachesToThis(context, second, third) }
            evaluator.isMemberInClass(method, VIEW) -> layoutName(context, second).takeIf { third?.isThis() == true }
            evaluator.isMemberInClass(method, LAYOUT_INFLATER) && evaluator.parameterHasType(method, 0, "int") ->
                layoutName(context, first).takeIf { attachesToThis(context, second, third) }
            else -> null
        }
    }

    private fun attachesToThis(context: JavaContext, parent: UExpression?, attach: UExpression?): Boolean =
        parent?.isThis() == true && (attach == null || attach.isTrue(context))

    private fun UExpression.isThis(): Boolean = skipParenthesizedExprDown() is UThisExpression

    private fun UExpression.isTrue(context: JavaContext): Boolean = ConstantEvaluator.evaluate(context, this) == true

    private fun layoutName(context: JavaContext, resource: UExpression?): String? {
        val url = ResourceEvaluator.getResource(context.evaluator, resource ?: return null) ?: return null
        return if (url.type == ResourceType.LAYOUT) url.name else null
    }

    /** A view binding is named after its layout: `view_crash_reporter.xml` becomes `ViewCrashReporterBinding`. */
    private fun bindingLayoutName(bindingClassName: String): String? {
        val stem = bindingClassName.removeSuffix("Binding")
        if (stem.isEmpty() || stem == bindingClassName) return null
        return stem.replace(UPPERCASE_BOUNDARY, "_").lowercase()
    }

    private fun layoutRootTags(context: JavaContext, layout: String): List<String> {
        val resources = context.client.getResources(context.project, ResourceRepositoryScope.PROJECT_ONLY)
        return resources.getResources(ResourceNamespace.RES_AUTO, ResourceType.LAYOUT, layout).mapNotNull { item ->
            val file = item.source?.toFile() ?: return@mapNotNull null
            context.client.xmlParser.parseXml(file)?.documentElement?.tagName
        }
    }
}
