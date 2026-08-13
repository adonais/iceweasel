/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.detekt

import io.gitlab.arturbosch.detekt.test.lint
import mozilla.components.tooling.detekt.acorn.MaterialOutlinedButtonUsageRule
import org.junit.Test
import kotlin.test.assertEquals

class MaterialOutlinedButtonUsageRuleTest {

    @Test
    fun `WHEN the M3 OutlinedButton is imported THEN it is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.OutlinedButton
        """.trimIndent()

        val findings = MaterialOutlinedButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
        assertEquals(
            MaterialOutlinedButtonUsageRule.MESSAGE,
            findings.first().message,
        )
    }

    @Test
    fun `WHEN the M3 OutlinedButton is imported with an alias THEN it is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.OutlinedButton as M3OutlinedButton
        """.trimIndent()

        val findings = MaterialOutlinedButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
    }

    @Test
    fun `WHEN the fully qualified M3 OutlinedButton is referenced THEN it is flagged`() {
        val code = """
            package com.example
            @Composable
            fun OutlinedButton() {
                androidx.compose.material3.OutlinedButton(onClick = {}) {}
            }
        """.trimIndent()

        val findings = MaterialOutlinedButtonUsageRule().lint(code)

        assertEquals(1, findings.size)
        assertEquals(
            MaterialOutlinedButtonUsageRule.MESSAGE,
            findings.first().message,
        )
    }

    @Test
    fun `WHEN the compose-base OutlinedButton, ButtonDefaults and ButtonColors are imported THEN they are not flagged`() {
        val code = """
            package com.example
            import mozilla.components.compose.base.button.OutlinedButton
            import androidx.compose.material3.ButtonDefaults
            import androidx.compose.material3.ButtonColors
            val colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors()
        """.trimIndent()

        val findings = MaterialOutlinedButtonUsageRule().lint(code)

        assertEquals(0, findings.size)
    }

    @Test
    fun `WHEN the M3 OutlinedButton is used multiple times THEN each usage is flagged`() {
        val code = """
            package com.example
            import androidx.compose.material3.OutlinedButton
            @Composable
            fun Content() {
                androidx.compose.material3.OutlinedButton(onClick = {}) {}
            }
        """.trimIndent()

        val findings = MaterialOutlinedButtonUsageRule().lint(code)

        assertEquals(2, findings.size)
    }
}
