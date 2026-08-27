/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import groovy.lang.Closure
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * The default help command reaches a developer verbatim and interpolates the variant name next to an
 * escaped `$`, so a reformatting can change what it prints without breaking the build.
 */
class ApiLintPluginExtensionTest {
    private val extension: ApiLintPluginExtension = ProjectBuilder.builder().build()
        .extensions.create("apiLint", ApiLintPluginExtension::class.java)

    @Test
    fun `the default help command names the variant's update task`() {
        assertEquals("\$ ./mach gradle apiUpdateFileDebug", extension.helpCommand.get()("Debug"))
        assertEquals("\$ ./mach gradle apiUpdateFileRelease", extension.helpCommand.get()("Release"))
    }

    @Test
    fun `the help command can be set from a Groovy closure`() {
        // GeckoView's build script is Groovy and assigns this with a closure, so the setter has to
        // keep accepting one.
        extension.setHelpCommand(
            object : Closure<String>(null) {
                @Suppress("unused")
                fun doCall(variantName: String) = "./mach gradle :geckoview:apiUpdateFile$variantName"
            },
        )

        assertEquals(
            "./mach gradle :geckoview:apiUpdateFileRelease",
            extension.helpCommand.get()("Release"),
        )
    }
}
