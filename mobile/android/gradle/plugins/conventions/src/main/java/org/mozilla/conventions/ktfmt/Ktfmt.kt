/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions.ktfmt

import com.diffplug.gradle.spotless.SpotlessExtension
import com.diffplug.gradle.spotless.SpotlessTask
import com.diffplug.spotless.LineEnding
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.file.FileTree
import org.mozilla.conventions.ProjectExtension

private const val MAX_LINE_LENGTH = 120

internal fun configureKtfmt(project: Project, mozilla: ProjectExtension) {
    val sourcePaths = mozilla.ktfmtSourcePaths

    // Resolve the include/exclude globs (with leading "!" meaning exclude)
    // into a FileTree rooted at projectDir, so Gradle can use the actual
    // Kotlin source set to compute UP-TO-DATE / build cache keys.
    // A PatternSet without includes matches every file, so projects that set no
    // source paths must get an empty tree rather than the whole projectDir.
    fun ktfmtSourceTree(): FileTree {
        val patterns = sourcePaths.get()
        if (patterns.none { !it.startsWith("!") }) {
            return project.files().asFileTree
        }
        return project.fileTree(project.projectDir).matching {
            patterns.forEach { pattern ->
                if (pattern.startsWith("!")) {
                    exclude(pattern.removePrefix("!"))
                } else {
                    include(pattern)
                }
            }
        }
    }

    // The settings allprojects hook applies this plugin while the project is still
    // being instantiated, before Gradle attaches VersionCatalogsExtension to it.
    // beforeEvaluate runs once the project is furnished but before its build script,
    // which is late enough for the catalog.
    project.beforeEvaluate {
        val libs = extensions.getByType(VersionCatalogsExtension::class.java).named("libs")
        val ktfmtVersion = libs.findVersion("ktfmt").get().requiredVersion

        pluginManager.apply("com.diffplug.spotless")

        configurations.register("ktfmt")
        dependencies.add("ktfmt", libs.findLibrary("ktfmt").get().get())

        extensions.configure(SpotlessExtension::class.java) {
            lineEndings = LineEnding.UNIX
            kotlin {
                target(project.files(project.provider { ktfmtSourceTree() }))
                ktfmt(ktfmtVersion).kotlinlangStyle().configure {
                    it.setMaxWidth(MAX_LINE_LENGTH)
                }
            }
        }

        tasks.withType(SpotlessTask::class.java).configureEach {
            group = "verification"
        }

        tasks.register("ktfmtCheck") {
            group = "verification"
            description = "Check Kotlin code style with ktfmt."
            dependsOn("spotlessKotlinCheck")
        }

        tasks.register("ktfmtFormat") {
            group = "formatting"
            description = "Format Kotlin code with ktfmt."
            dependsOn("spotlessKotlinApply")
        }
    }
}
