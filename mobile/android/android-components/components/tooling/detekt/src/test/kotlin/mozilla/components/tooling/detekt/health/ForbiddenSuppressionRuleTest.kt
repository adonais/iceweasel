/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.detekt.health

import io.gitlab.arturbosch.detekt.test.TestConfig
import io.gitlab.arturbosch.detekt.test.compileAndLint
import io.gitlab.arturbosch.detekt.test.lint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ForbiddenSuppressionRuleTest {

    @Test
    fun `single forbidden suppression is reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf("VariableNaming"),
            ),
        )

        val code = """
            class Test {
                @Suppress("VariableNaming")
                fun suppressedFunction() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
    }

    @Test
    fun `forbidden suppression with argument name is reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf("ForbiddenRule1"),
            ),
        )

        val code = """
            class Test {
                @Suppress(names = ["ForbiddenRule1"])
                fun suppressedFunction() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
    }

    @Test
    fun `forbidden suppression on an expression is reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf("UNCHECKED_CAST"),
            ),
        )

        val code = """
            class Test {
                fun myFunction() {
                    @Suppress("UNCHECKED_CAST")
                    val result = someValue as String
                    // Other code without suppression
                    println("Hello")
                }
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
    }

    @Test
    fun `forbidden suppression at file level is reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf("ForbiddenRule"),
            ),
        )

        val code = """
            @file:Suppress("ForbiddenRule")
            class Test {
                fun myFunction() {
                    println("Hello")
                }
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
    }

    @Test
    fun `unforbidden suppression is not reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf("ForbiddenRule1"),
            ),
        )

        val code = """
            class Test {
                @Suppress("Unforbidden")
                fun myFunction() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(0, findings.size)
    }

    @Test
    fun `multiple forbidden suppressions in multiple @Suppress annotations are reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenRule1")
                fun myFunction1() = Unit
                @Suppress("ForbiddenRule1, UnforbiddenRule")
                fun myFunction2() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(2, findings.size)
    }

    @Test
    fun `multiple forbidden suppressions as separate string args in the same annotation are reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenRule1","UnforbiddenRule","ForbiddenRule2")
                fun myFunction1() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
        assertTrue(
            "Finding message should contain ForbiddenRule1",
            findings[0].message.contains("ForbiddenRule1"),
        )
        assertTrue(
            "Finding message should contain ForbiddenRule2",
            findings[0].message.contains("ForbiddenRule2"),
        )
    }

    @Test
    fun `multiple forbidden suppressions in the same annotation are reported`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenRule1,UnforbiddenRule,ForbiddenRule2")
                fun myFunction1() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(1, findings.size)
        assertTrue(
            "Finding message should contain ForbiddenRule1",
            findings[0].message.contains("ForbiddenRule1"),
        )
        assertTrue(
            "Finding message should contain ForbiddenRule2",
            findings[0].message.contains("ForbiddenRule2"),
        )
    }

    @Test
    fun `suppression of ForbiddenSuppression is reported when includeSelf is not specified`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenSuppression", "UnforbiddenRule")
                fun myFunction1() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertEquals(
            "Expected that 1 finding is reported",
            1,
            findings.size,
        )
        assertTrue(
            "Finding message should contain ForbiddenSuppression",
            findings[0].message.contains("ForbiddenSuppression"),
        )
    }

    @Test
    fun `suppression of ForbiddenSuppression is reported when includeSelf is true`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
                "includeSelf" to true,
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenSuppression", "UnforbiddenRule")
                fun myFunction1() = Unit
            }
        """.trimIndent()

        val findings = rule.compileAndLint(code)
        assertTrue(
            "Finding message should contain ForbiddenSuppression",
            findings[0].message.contains("ForbiddenSuppression"),
        )
    }

    @Test
    fun `suppression of ForbiddenSuppression is not reported if includeSelf is false`() {
        val rule = ForbiddenSuppressionRule(
            config = TestConfig(
                "forbiddenSuppressions" to listOf(
                    "ForbiddenRule1",
                    "ForbiddenRule2",
                ),
                "includeSelf" to false,
            ),
        )

        val code = """
            class Test {
                @Suppress("ForbiddenSuppression", "UnforbiddenRule")
                fun myFunction1() = Unit
            }
        """.trimIndent()

        val findings = rule.lint(code)
        assertTrue(
            "Expected that no finding is reported",
            findings.isEmpty(),
        )
    }
}
