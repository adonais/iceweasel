/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.Project
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * These exercise the parts of the plugin that do not need the Android Gradle plugin on the classpath. The per-variant
 * tasks are registered from an `onVariants` callback, so covering those needs a real `com.android.library` project.
 */
class ApiLintPluginTest {
    private fun project(): Project =
        ProjectBuilder.builder().build().also {
            it.pluginManager.apply(ApiLintPlugin::class.java)
        }

    private fun extension(project: Project) = project.extensions.getByType(ApiLintPluginExtension::class.java)

    @Test
    fun `registers the apiLint extension`() {
        assertNotNull(project().extensions.findByName("apiLint"))
    }

    @Test
    fun `does not register tasks until the android library plugin is applied`() {
        val project = project()

        // Everything the plugin adds hangs off `withPlugin("com.android.library")`, which also
        // keeps the Android-only classes it references off the classpath until then. Every name the
        // plugin registers has to stay behind that guard, not just the ones the API check runs.
        assertEquals(
            emptyList<String>(),
            project.tasks.names.filter { it.startsWith("api") || it == "copyDocletJarResource" },
        )
    }

    @Test
    fun `applies the documented default conventions`() {
        val extension = extension(project())

        assertEquals(".", extension.packageFilter.get())
        assertEquals("api.txt", extension.apiOutputFileName.get())
        assertEquals("api.txt", extension.currentApiRelativeFilePath.get())
        assertEquals("apilint-result.json", extension.jsonResultFileName.get())
        assertEquals(emptyList<String>(), extension.skipClassesRegex.get())
    }

    @Test
    fun `leaves the optional scalar settings unset by default`() {
        val extension = extension(project())

        assertFalse(extension.changelogFileName.isPresent)
        assertFalse(extension.deprecationAnnotation.isPresent)
        assertFalse(extension.libraryVersion.isPresent)
    }

    @Test
    fun `reports the optional list settings as present even when unconfigured`() {
        // Gradle gives a ListProperty an empty value rather than no value, so unlike the scalar
        // settings above these read as present when nothing has been configured. Anything deciding
        // whether to forward them to apilint.py has to test for emptiness, not presence.
        val extension = extension(project())

        assertTrue(extension.lintFilters.isPresent)
        assertTrue(extension.allowedPackages.isPresent)
        assertEquals(emptyList<String>(), extension.lintFilters.get())
        assertEquals(emptyList<String>(), extension.allowedPackages.get())
    }
}
