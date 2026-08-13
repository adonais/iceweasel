package mozilla.components.tooling.detekt.naming

import io.gitlab.arturbosch.detekt.test.lint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClassAcronymCasingRuleTest {

    @Test
    fun `class with three-letter all-caps acronym is flagged`() {
        val findings = ClassAcronymCasingRule().lint("class XMLFormatter")

        assertEquals(1, findings.size)
        assertTrue(
            findings.first().message.contains(
                "Acronym `XML` in class name `XMLFormatter` has more than two letters and " +
                    "should capitalize only the first letter, e.g. `XmlFormatter`.",
            ),
        )
    }

    @Test
    fun `class with five-letter acronym is flagged`() {
        val findings = ClassAcronymCasingRule().lint("class HTTPSConnection")

        assertEquals(1, findings.size)
        assertTrue(
            findings.first().message.contains(
                "Acronym `HTTPS` in class name `HTTPSConnection` has more than two letters and " +
                    "should capitalize only the first letter, e.g. `HttpsConnection`.",
            ),
        )
    }

    @Test
    fun `class with acronym before digits and a trailing word is flagged`() {
        val findings = ClassAcronymCasingRule().lint("class HTML5Parser")

        assertEquals(1, findings.size)
        assertTrue(
            findings.first().message.contains(
                "Acronym `HTML` in class name `HTML5Parser` has more than two letters and " +
                    "should capitalize only the first letter, e.g. `Html5Parser`.",
            ),
        )
    }

    @Test
    fun `class with two adjacent acronyms is flagged`() {
        val findings = ClassAcronymCasingRule().lint("class XMLHttpRequest")

        assertEquals(1, findings.size)
        assertTrue(
            findings.first().message.contains(
                "Acronym `XML` in class name `XMLHttpRequest` has more than two letters and " +
                    "should capitalize only the first letter, e.g. `XmlHttpRequest`.",
            ),
        )
    }

    @Test
    fun `class with already-capitalized adjacent acronyms is clean`() {
        val findings = ClassAcronymCasingRule().lint("class XmlHttpRequest")

        assertEquals(0, findings.size)
    }

    @Test
    fun `class with two-letter acronym is clean`() {
        val findings = ClassAcronymCasingRule().lint(
            """
            class IOStream
            class IOInputStream
            """.trimIndent(),
        )

        assertEquals(0, findings.size)
    }

    @Test
    fun `all-caps enum entries are not flagged`() {
        val findings = ClassAcronymCasingRule().lint(
            """
            enum class SortOption {
                NAME,
                POPULARITY,
            }
            """.trimIndent(),
        )

        assertEquals(0, findings.size)
    }

    @Test
    fun `method with a long acronym is not flagged`() {
        val findings = ClassAcronymCasingRule().lint(
            """
            class Site {
                fun getURL(): String = ""
                fun parseHTML5() {}
            }
            """.trimIndent(),
        )

        assertEquals(0, findings.size)
    }

    @Test
    fun `top-level function with a long acronym is not flagged`() {
        val findings = ClassAcronymCasingRule().lint("fun String.sanitizeURL(): String = this")

        assertEquals(0, findings.size)
    }

    @Test
    fun `anonymous object declaration is skipped`() {
        val findings = ClassAcronymCasingRule().lint(
            """
            val listener = object : Runnable {
                override fun run() {}
            }
            """.trimIndent(),
        )

        assertEquals(0, findings.size)
    }
}
