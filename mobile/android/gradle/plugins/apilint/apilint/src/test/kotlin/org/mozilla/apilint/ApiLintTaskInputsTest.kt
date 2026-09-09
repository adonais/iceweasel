/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.Project
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The lint tasks read these settings while they run, so Gradle only knows a configuration change should re-run them if
 * they are declared as inputs too.
 */
class ApiLintTaskInputsTest {
    private lateinit var project: Project
    private lateinit var extension: ApiLintPluginExtension

    private fun task(): PythonExec {
        project = ProjectBuilder.builder().build()
        extension = project.extensions.create("apiLint", ApiLintPluginExtension::class.java)
        return project.tasks.register("apiLintSingleDebug", PythonExec::class.java).get()
    }

    @Test
    fun `lint filter settings are declared as inputs`() {
        val task = task()
        task.declareLintFilterInputs(extension)

        assertTrue(task.inputs.properties.containsKey("lintFilters"))
        assertTrue(task.inputs.properties.containsKey("allowedPackages"))
    }

    @Test
    fun `deprecation settings are declared as inputs`() {
        val task = task()
        task.declareDeprecationInputs(extension)

        assertTrue(task.inputs.properties.containsKey("deprecationAnnotation"))
        assertTrue(task.inputs.properties.containsKey("libraryVersion"))
    }

    @Test
    fun `declared inputs track the configured values`() {
        val task = task()
        task.declareLintFilterInputs(extension)
        task.declareDeprecationInputs(extension)

        extension.lintFilters.set(listOf("GV"))
        extension.allowedPackages.set(listOf("org.mozilla.geckoview"))
        extension.deprecationAnnotation.set("org.mozilla.geckoview.DeprecationSchedule")
        // GeckoView derives this from the Firefox version, so it changes every release and has to
        // invalidate the lint.
        extension.libraryVersion.set(145)

        assertEquals(listOf("GV"), task.inputs.properties["lintFilters"])
        assertEquals(listOf("org.mozilla.geckoview"), task.inputs.properties["allowedPackages"])
        assertEquals(
            "org.mozilla.geckoview.DeprecationSchedule",
            task.inputs.properties["deprecationAnnotation"],
        )
        assertEquals(145, task.inputs.properties["libraryVersion"])
    }

    @Test
    fun `the optional deprecation settings snapshot as absent when unconfigured`() {
        val task = task()
        task.declareDeprecationInputs(extension)

        assertNull(task.inputs.properties["deprecationAnnotation"])
        assertNull(task.inputs.properties["libraryVersion"])
    }
}
