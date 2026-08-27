/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.Project
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The doclet derives the map's name from the API file it is handed, and the lint tasks read the map
 * back, so the two paths have to agree or the declared output will not match what gets written.
 */
class ApiCompatLintTaskTest {
    private val project: Project = ProjectBuilder.builder().build()

    @Test
    fun `the map file sits beside the API file`() {
        val apiFile = project.layout.buildDirectory.file("apilint/debug/api.txt")

        val mapFile = apiMapFileFor(project.layout, apiFile)

        assertEquals("${apiFile.get().asFile.path}.map", mapFile.get().asFile.path)
    }

    @Test
    fun `the map file follows a renamed API file`() {
        val apiFile = project.layout.buildDirectory.file("apilint/debug/geckoview-api.txt")

        val mapFile = apiMapFileFor(project.layout, apiFile)

        assertEquals("geckoview-api.txt.map", mapFile.get().asFile.name)
    }

    @Test
    fun `the task declares the map as an output`() {
        val task = project.tasks.register("apiGenerateDebug", ApiCompatLintTask::class.java).get()
        val apiFile = project.layout.buildDirectory.file("apilint/debug/api.txt")

        task.outputFile.set(apiFile)
        task.apiMapFile.set(apiMapFileFor(project.layout, apiFile))

        assertTrue(task.outputs.files.contains(task.apiMapFile.get().asFile))
    }
}
