/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.lint

import com.android.tools.lint.checks.infrastructure.LintDetectorTest
import com.android.tools.lint.checks.infrastructure.TestFile
import com.android.tools.lint.checks.infrastructure.TestFiles.rClass
import com.android.tools.lint.checks.infrastructure.TestMode
import com.android.tools.lint.detector.api.Detector
import com.android.tools.lint.detector.api.Issue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ConstraintLayoutInflationDetectorTest : LintDetectorTest() {

    override fun getIssues(): MutableList<Issue> = mutableListOf(ConstraintLayoutInflationDetector.ISSUE)

    override fun getDetector(): Detector = ConstraintLayoutInflationDetector()

    private val androidStubs =
        arrayOf(
            java(
                    """
            package android.content;
            public class Context {}
            """
                )
                .indented(),
            java(
                    """
            package android.view;
            import android.content.Context;
            public class View {
                public View(Context context) {}
                public static View inflate(Context context, int resource, ViewGroup root) { return null; }
            }
            """
                )
                .indented(),
            java(
                    """
            package android.view;
            import android.content.Context;
            public class ViewGroup extends View {
                public ViewGroup(Context context) { super(context); }
            }
            """
                )
                .indented(),
            java(
                    """
            package android.view;
            import android.content.Context;
            public class LayoutInflater {
                public static LayoutInflater from(Context context) { return null; }
                public View inflate(int resource, ViewGroup root) { return null; }
                public View inflate(int resource, ViewGroup root, boolean attachToRoot) { return null; }
            }
            """
                )
                .indented(),
            java(
                    """
            package androidx.constraintlayout.widget;
            import android.content.Context;
            import android.view.ViewGroup;
            public class ConstraintLayout extends ViewGroup {
                public ConstraintLayout(Context context) { super(context); }
            }
            """
                )
                .indented(),
            java(
                    """
            package androidx.viewbinding;
            public interface ViewBinding {}
            """
                )
                .indented(),
            java(
                    """
            package test.pkg.databinding;
            import android.view.LayoutInflater;
            import android.view.ViewGroup;
            import androidx.viewbinding.ViewBinding;
            public final class ViewCrashReporterBinding implements ViewBinding {
                public static ViewCrashReporterBinding inflate(LayoutInflater inflater, ViewGroup parent) { return null; }
                public static ViewCrashReporterBinding inflate(LayoutInflater inflater, ViewGroup parent, boolean attachToParent) { return null; }
            }
            """
                )
                .indented(),
            rClass("test.pkg", "@layout/view_crash_reporter"),
        )

    private val constraintLayoutRootedLayout =
        xml(
            "res/layout/view_crash_reporter.xml",
            """
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content" />

</androidx.constraintlayout.widget.ConstraintLayout>
""",
        )

    private val mergeRootedLayout =
        xml(
            "res/layout/view_crash_reporter.xml",
            """
<merge xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    tools:parentTag="androidx.constraintlayout.widget.ConstraintLayout">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content" />

</merge>
""",
        )

    /** A view extending ConstraintLayout whose constructor runs [inflation]. */
    private fun constraintLayoutView(inflation: String): TestFile =
        kotlin(
                """
            package test.pkg

            import android.content.Context
            import android.view.LayoutInflater
            import android.view.View
            import androidx.constraintlayout.widget.ConstraintLayout
            import test.pkg.databinding.ViewCrashReporterBinding

            class CrashContentView(context: Context) : ConstraintLayout(context) {
                init {
                    $inflation
                }
            }
            """
            )
            .indented()

    /** The detector only looks in the view's own module, so the mode that moves resources out of it does not apply. */
    private fun lintWith(layout: TestFile, vararg views: TestFile) =
        lint().files(*androidStubs, layout, *views).allowMissingSdk(true).skipTestModes(TestMode.MODULE_RESOURCES).run()

    @Test
    fun `GIVEN a binding inflated into the view WHEN the layout root is a ConstraintLayout THEN it is an error`() {
        lintWith(
                constraintLayoutRootedLayout,
                constraintLayoutView("ViewCrashReporterBinding.inflate(LayoutInflater.from(context), this)"),
            )
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN a binding inflated into the view WHEN the layout root is a merge THEN it is clean`() {
        lintWith(
                mergeRootedLayout,
                constraintLayoutView("ViewCrashReporterBinding.inflate(LayoutInflater.from(context), this)"),
            )
            .expectClean()
    }

    @Test
    fun `GIVEN a binding inflated and attached explicitly WHEN the layout root is a ConstraintLayout THEN it is an error`() {
        lintWith(
                constraintLayoutRootedLayout,
                constraintLayoutView("ViewCrashReporterBinding.inflate(LayoutInflater.from(context), this, true)"),
            )
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN a binding inflated but not attached WHEN the layout root is a ConstraintLayout THEN it is clean`() {
        lintWith(
                constraintLayoutRootedLayout,
                constraintLayoutView("ViewCrashReporterBinding.inflate(LayoutInflater.from(context), this, false)"),
            )
            .expectClean()
    }

    @Test
    fun `GIVEN View inflate into the view WHEN the layout root is a ConstraintLayout THEN it is an error`() {
        lintWith(
                constraintLayoutRootedLayout,
                constraintLayoutView("View.inflate(context, R.layout.view_crash_reporter, this)"),
            )
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN LayoutInflater inflate into the view WHEN the layout root is a ConstraintLayout THEN it is an error`() {
        lintWith(
                constraintLayoutRootedLayout,
                constraintLayoutView("LayoutInflater.from(context).inflate(R.layout.view_crash_reporter, this, true)"),
            )
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN the layout id is a constant WHEN the layout root is a ConstraintLayout THEN it is an error`() {
        lintWith(
                constraintLayoutRootedLayout,
                kotlin(
                        """
                    package test.pkg

                    import android.content.Context
                    import android.view.View
                    import androidx.constraintlayout.widget.ConstraintLayout

                    private const val LAYOUT_ID = R.layout.view_crash_reporter

                    class CrashContentView(context: Context) : ConstraintLayout(context) {
                        init {
                            View.inflate(context, LAYOUT_ID, this)
                        }
                    }
                    """
                    )
                    .indented(),
            )
            .expectErrorCount(1)
    }

    @Test
    fun `GIVEN a view that is not a ConstraintLayout WHEN it inflates a ConstraintLayout THEN it is clean`() {
        lintWith(
                constraintLayoutRootedLayout,
                kotlin(
                        """
                    package test.pkg

                    import android.content.Context
                    import android.view.LayoutInflater
                    import android.view.ViewGroup
                    import test.pkg.databinding.ViewCrashReporterBinding

                    class CrashContentView(context: Context) : ViewGroup(context) {
                        init {
                            ViewCrashReporterBinding.inflate(LayoutInflater.from(context), this)
                        }
                    }
                    """
                    )
                    .indented(),
            )
            .expectClean()
    }
}
