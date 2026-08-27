/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class PythonExecTest {
    private fun task(): PythonExec = ProjectBuilder.builder().build()
        .tasks.register("pythonExec", PythonExec::class.java).get()

    @Test
    fun `prefers the interpreter mach passes over a bare python3`() {
        // Under `mach gradle` the variable is set, so this asserts the wiring rather than a fixed
        // value; run outside mach and it exercises the fallback instead.
        val expected = System.getenv(PythonExec.MACH_PYTHON_ENV_VAR) ?: "python3"

        assertEquals(expected, task().pythonCommand.get())
    }

    @Test
    fun `the python command can be overridden`() {
        val task = task()

        task.pythonCommand.set("/usr/bin/python3.12")

        assertEquals("/usr/bin/python3.12", task.pythonCommand.get())
    }

    @Test
    fun `the scripts it runs are packaged as resources`() {
        // The tasks set `scriptPath` to a bare file name and PythonExec resolves it from the
        // classpath, so the scripts have to ship in the jar rather than be read from the source
        // tree.
        for (script in listOf("apilint.py", "diff.py", "changelog-check.py")) {
            assertNotNull(
                PythonExec::class.java.classLoader.getResourceAsStream(script),
                "$script is not on the runtime classpath",
            )
        }
    }
}
