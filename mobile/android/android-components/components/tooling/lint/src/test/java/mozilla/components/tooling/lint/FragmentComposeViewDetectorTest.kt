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
class FragmentComposeViewDetectorTest : LintDetectorTest() {

    override fun getDetector(): Detector = FragmentComposeViewDetector()

    override fun getIssues(): List<Issue> = FragmentComposeViewDetector.ISSUES

    private val fragmentStub = kotlin(
        """
        package androidx.fragment.app

        import android.content.Context
        import android.os.Bundle
        import android.view.LayoutInflater
        import android.view.View
        import android.view.ViewGroup

        open class Fragment {
            open fun onCreateView(
                inflater: LayoutInflater,
                container: ViewGroup?,
                savedInstanceState: Bundle?,
            ): View? = null

            fun requireContext(): Context = Context()
        }
        """,
    ).indented()

    private val composeViewStub = kotlin(
        """
        package androidx.compose.ui.platform

        import android.content.Context
        import android.view.View

        open class AbstractComposeView(context: Context) : View(context) {
            fun setViewCompositionStrategy(strategy: ViewCompositionStrategy) = Unit
        }
        class ComposeView(context: Context) : AbstractComposeView(context)

        interface ViewCompositionStrategy {
            object DisposeOnViewTreeLifecycleDestroyed : ViewCompositionStrategy
            object DisposeOnDetachedFromWindow : ViewCompositionStrategy
        }
        """,
    ).indented()

    private val stubs = arrayOf(fragmentStub, composeViewStub)

    @Test
    fun `returning ComposeView from Fragment onCreateView reports error`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return ComposeView(context)
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expect(
                """
                src/test/MyFragment.kt:16: Error: Use content {} to avoid a memory leak caused by missing setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed). [MissingViewCompositionStrategy]
                        return ComposeView(context)
                               ~~~~~~~~~~~
                1 error
            """.trimIndent(),
            )
    }

    @Test
    fun `returning ComposeView chained with apply from Fragment onCreateView reports error`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return ComposeView(inflater.context).apply {
                                 setContent {
                                     // ...
                                 }
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expect(
                """
                src/test/MyFragment.kt:16: Error: Use content {} to avoid a memory leak caused by missing setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed). [MissingViewCompositionStrategy]
                        return ComposeView(inflater.context).apply {
                               ~~~~~~~~~~~
                1 error
            """.trimIndent(),
            )
    }

    @Test
    fun `returning ComposeView with correct view composition strategy reports a warning`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.compose.ui.platform.ViewCompositionStrategy
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return ComposeView(inflater.context).apply {
                                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expect(
                """
                src/test/MyFragment.kt:17: Warning: Prefer content {} instead of manually constructing a ComposeView in onCreateView(). [UseFragmentContent]
                        return ComposeView(inflater.context).apply {
                               ~~~~~~~~~~~
                0 errors, 1 warning
            """.trimIndent(),
            )
    }

    @Test
    fun `returning ComposeView with wrong view composition strategy reports an error`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.compose.ui.platform.ViewCompositionStrategy
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return ComposeView(inflater.context).apply {
                                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expect(
                """
                    src/test/MyFragment.kt:17: Error: Use content {} to avoid a memory leak caused by missing setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed). [MissingViewCompositionStrategy]
                            return ComposeView(inflater.context).apply {
                                   ~~~~~~~~~~~
                    1 error
                """.trimIndent(),
            )
    }

    @Test
    fun `returning ComposeView from a different method is clean`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.content.Context
                    import android.view.View
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        fun createComposeView(context: Context): View {
                            return ComposeView(context)
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expectClean()
    }

    @Test
    fun `returning ComposeView in a different class is clean`() {
        lint()
            .files(
                composeViewStub,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView

                    class NotAFragment {
                        fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return ComposeView(inflater.context)
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expectClean()
    }

    @Test
    fun `returning content extension function is clean`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package androidx.fragment.compose

                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    fun Fragment.content(content: @Composable () -> Unit): ComposeView {
                        return ComposeView(requireContext()).apply {
                            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                            setContent(content)
                        }
                    }
                    """,
                ).indented(),
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.fragment.app.Fragment
                    import androidx.fragment.compose.content

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return content {
                                // ...
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expectClean()
    }

    @Test
    fun `adding ComposeView to a different layout is clean`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import android.widget.LinearLayout
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return LinearLayout(requireContext()).apply {
                                addView(ComposeView(requireContext()))
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expectClean()
    }

    /**
     * The example code here is a bit contrived. It would actually be good to flag this usage,
     * because `run {}` is a trivial wrapper and the `ComposeView` is actually returned from `onCreateView()`.
     * But this is the simplest case to test ignoring returns in lambdas.
     * And we want to ignore returns in lambdas, because we don't want to accidentally flag something
     * that isn't really returned from `onCreateView()`.
     */
    @Test
    fun `returning ComposeView from inside a lambda is clean`() {
        lint()
            .files(
                *stubs,
                kotlin(
                    """
                    package test

                    import android.os.Bundle
                    import android.view.LayoutInflater
                    import android.view.View
                    import android.view.ViewGroup
                    import androidx.compose.ui.platform.ComposeView
                    import androidx.fragment.app.Fragment

                    class MyFragment : Fragment() {
                        override fun onCreateView(
                            inflater: LayoutInflater,
                            container: ViewGroup?,
                            savedInstanceState: Bundle?,
                        ): View {
                            return run {
                                ComposeView(requireContext())
                            }
                        }
                    }
                    """,
                ).indented(),
            )
            .run()
            .expectClean()
    }
}
