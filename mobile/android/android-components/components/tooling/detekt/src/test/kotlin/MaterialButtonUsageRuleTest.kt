/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.detekt

import io.gitlab.arturbosch.detekt.test.lint
import mozilla.components.tooling.detekt.acorn.MaterialButtonUsageRule
import org.junit.Test
import kotlin.test.assertEquals

class MaterialButtonUsageRuleTest {

    @Test
    fun `WHEN the M3 Button is imported THEN it is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.Button
        """.trimIndent()

        val findings = MaterialButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
        assertEquals(
            MaterialButtonUsageRule.MESSAGE,
            findings.first().message,
        )
    }

    @Test
    fun `WHEN the M3 Button is imported with an alias THEN it is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.Button as M3Button
        """.trimIndent()

        val findings = MaterialButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
    }

    @Test
    fun `WHEN the fully qualified M3 Button is referenced THEN it is flagged`() {
        val code = """
            package com.example
            @Composable
            fun Button() {
                androidx.compose.material3.Button(onClick = {}) {}
            }
        """.trimIndent()

        val findings = MaterialButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
        assertEquals(
            MaterialButtonUsageRule.MESSAGE,
            findings.first().message,
        )
    }

    @Test
    fun `WHEN the compose-base FilledButton, ButtonDefaults and ButtonColors are imported THEN they are not flagged`() {
        val code = """
            package com.example
            import mozilla.components.compose.base.button.FilledButton
            import androidx.compose.material3.ButtonDefaults
            import androidx.compose.material3.ButtonColors
            val colors = androidx.compose.material3.ButtonDefaults.buttonColors()
        """.trimIndent()

        val findings = MaterialButtonUsageRule().lint(code)

        assertEquals(0, findings.size)
    }

    @Test
    fun `WHEN the M3 Button is used multiple times THEN each usage is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.Button
            @Composable
            fun Content() {
                androidx.compose.material3.Button(onClick = {}) {}
            }
        """.trimIndent()

        val findings = MaterialButtonUsageRule().lint(code)

        assertEquals(2, findings.size)
    }
}
