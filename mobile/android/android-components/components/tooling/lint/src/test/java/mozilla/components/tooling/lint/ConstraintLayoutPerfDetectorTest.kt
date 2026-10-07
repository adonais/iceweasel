/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.lint

import com.android.tools.lint.checks.infrastructure.LintDetectorTest
import com.android.tools.lint.detector.api.Detector
import com.android.tools.lint.detector.api.Issue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ConstraintLayoutPerfDetectorTest : LintDetectorTest() {

    override fun getIssues(): MutableList<Issue> = mutableListOf(ConstraintLayoutPerfDetector.ISSUE)

    override fun getDetector(): Detector = ConstraintLayoutPerfDetector()

    private fun layoutWithChild(child: String) =
        xml(
            "res/layout/layout.xml",
            """
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <$child
        android:layout_width="match_parent"
        android:layout_height="wrap_content" />

</androidx.constraintlayout.widget.ConstraintLayout>
""",
        )

    @Test
    fun `GIVEN a single ConstraintLayout WHEN linting THEN it is clean`() {
        lint().files(layoutWithChild("TextView")).allowMissingSdk(true).run().expectClean()
    }

    @Test
    fun `GIVEN two ConstraintLayouts WHEN linting THEN the second one is an error`() {
        lint()
            .files(layoutWithChild("androidx.constraintlayout.widget.ConstraintLayout"))
            .allowMissingSdk(true)
            .run()
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN a MotionLayout nested in a ConstraintLayout WHEN linting THEN it is an error`() {
        lint()
            .files(layoutWithChild("androidx.constraintlayout.motion.widget.MotionLayout"))
            .allowMissingSdk(true)
            .run()
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN two ConstraintLayouts as siblings WHEN linting THEN the second one is an error`() {
        lint()
            .files(
                xml(
                    "res/layout/layout.xml",
                    """
<LinearLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <androidx.constraintlayout.widget.ConstraintLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content" />

    <androidx.constraintlayout.widget.ConstraintLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content" />

</LinearLayout>
""",
                )
            )
            .allowMissingSdk(true)
            .run()
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN a view of ours that extends ConstraintLayout WHEN linting THEN it is clean`() {
        lint()
            .files(layoutWithChild("mozilla.components.ui.widgets.WidgetSiteItemView"))
            .allowMissingSdk(true)
            .run()
            .expectClean()
    }

    @Test
    fun `GIVEN a Guideline in a ConstraintLayout WHEN linting THEN it is clean`() {
        lint()
            .files(layoutWithChild("androidx.constraintlayout.widget.Guideline"))
            .allowMissingSdk(true)
            .run()
            .expectClean()
    }
}
