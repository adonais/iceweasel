/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.lint

import com.android.resources.ResourceFolderType
import com.android.tools.lint.detector.api.Category
import com.android.tools.lint.detector.api.Context
import com.android.tools.lint.detector.api.Implementation
import com.android.tools.lint.detector.api.Issue
import com.android.tools.lint.detector.api.ResourceXmlDetector
import com.android.tools.lint.detector.api.Scope
import com.android.tools.lint.detector.api.Severity
import com.android.tools.lint.detector.api.XmlContext
import org.w3c.dom.Element

/** The framework's ConstraintLayout and the framework views that extend it. */
internal val CONSTRAINT_LAYOUT_ELEMENTS =
    setOf(
        "androidx.constraintlayout.widget.ConstraintLayout",
        "androidx.constraintlayout.motion.widget.MotionLayout",
    )
private val CONSTRAINT_LAYOUT_ELEMENTS_BULLETED_LIST = CONSTRAINT_LAYOUT_ELEMENTS.map { "- `$it`" }.joinToString("\n")

private const val ISSUE_DESCRIPTION = "2+ ConstraintLayouts in one hierarchy can be inefficient"
private const val ISSUE_MESSAGE =
    "Flatten the view hierarchy by using one `ConstraintLayout`, " +
        "if possible. If the alternative is several nested `ViewGroup`, it may not help performance and " +
        "this may be worth suppressing."
private val ISSUE_EXPLANATION =
    """
    `ConstraintLayout`'s main performance benefit is
        that it enables devs to define layouts with very little view nesting. However, they are slow to
        inflate so we only want to use as many as are strictly necessary. In most cases, this is one: a
        layout can have a ConstraintLayout defined at the root and the entire hierarchy can be a direct
        descendant of it.

        This check will report if there is more than one ConstraintLayout defined in a single layout file
        to remind the implementor of these performance concerns.

        **WARNING: replacing a ConstraintLayout with several nested ViewGroups is unlikely to improve
        performance. Remember, a goal is to reduce nesting. If you're unable to remove the extra
        ConstraintLayout(s) without doing this, it's probably better to suppress this violation.**

        Here are **known cases where ConstraintLayouts are unnecessarily nested and the alternatives:**
        - To set a background color. Instead, use a `<view>` of the appropriate size directly in the ConstraintLayout
        - To change visibility on a group of sub-views. Instead, use `androidx.constraintlayout.widget.Group`

        There are a few cases the perf team is not 100% sure of the best solution - let us know if you
        have better solutions:
        - ScrollView can only have one child so perhaps making it a ConstraintLayout is fine, despite nesting
        - a11y may rely on nesting views. Maybe `Group` solves this problem?

        The following views are inspected in this check:
    """
        .trimIndent()
        .lines()
        .joinToStringRemovingManualWrapping() + "\n$CONSTRAINT_LAYOUT_ELEMENTS_BULLETED_LIST\n\n"

/**
 * A custom lint detector that helps us ensure we're using ConstraintLayout performantly.
 *
 * This detector has a few shortcomings:
 * - it will not notice if a ConstraintLayout is in the same view hierarchy at runtime but added from a different file
 *   (e.g. via <include>)
 * - it will not notice if a ConstraintLayout is added at runtime
 * - it will not notice a view of ours that extends ConstraintLayout. [ConstraintLayoutInflationDetector] covers the
 *   case of those that cost anything, which is one inflating a second ConstraintLayout into itself.
 */
class ConstraintLayoutPerfDetector : ResourceXmlDetector() {

    companion object {
        val ISSUE =
            Issue.create(
                id = "MozMultipleConstraintLayouts",
                briefDescription = ISSUE_DESCRIPTION,
                explanation = ISSUE_EXPLANATION,
                category = Category.PERFORMANCE,
                priority = 8, // UseCompoundDrawables is a 6 and I think this is much more impactful.
                severity = Severity.ERROR,
                implementation =
                    Implementation(
                        ConstraintLayoutPerfDetector::class.java,
                        Scope.RESOURCE_FILE_SCOPE,
                    ),
            )
    }

    private var constraintLayoutCountInFile = 0

    override fun appliesTo(folderType: ResourceFolderType): Boolean = folderType == ResourceFolderType.LAYOUT

    override fun getApplicableElements(): Collection<String> = CONSTRAINT_LAYOUT_ELEMENTS

    override fun beforeCheckFile(context: Context) {
        constraintLayoutCountInFile = 0
    }

    override fun visitElement(context: XmlContext, element: Element) {
        // This scope is unideal: if the root element is a ConstraintLayout and is suppressed, all
        // ConstraintLayout children will also be suppressed. If more ConstraintLayout children are
        // added, the root ConstraintLayout will suppress them too. Ideally, we'd want a suppression
        // to only affect a node and not its children.
        //
        // We only warn on 2+ violations because:
        // - we avoid having 2 warnings for the first intuitive violation (i.e. 2 ConstraintLayouts
        // in a file is one violation on the second ConstraintLayout)
        // - of the suppression & scope issues mentioned above. The first found element is most
        // likely to be a parent of other ConstraintLayouts because of the traversal order so if
        // there's one node we don't report on, that's the best one.
        constraintLayoutCountInFile += 1
        if (constraintLayoutCountInFile > 1) {
            context.report(ISSUE, element, context.getElementLocation(element), ISSUE_MESSAGE)
        }
    }
}

/** Takes paragraphs wrapped by hand and combines them into a single line, preserving white space between paragraphs. */
private fun List<String>.joinToStringRemovingManualWrapping(): String =
    fold("") { acc, str ->
        val toAppend =
            when {
                str.isBlank() -> "\n\n" // new paragraph
                str.trim().startsWith("-") -> "\n$str" // bulleted list
                else -> str
            }
        acc + toAppend
    }
