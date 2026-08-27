/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.ProjectLayout
import org.gradle.api.file.RegularFile
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.provider.Provider
import org.gradle.api.tasks.CacheableTask
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.javadoc.Javadoc
import org.gradle.external.javadoc.StandardJavadocDocletOptions
import java.io.File

// `Javadoc` is cacheable, but Gradle does not inherit that to subclasses.
@CacheableTask
abstract class ApiCompatLintTask : Javadoc() {
    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    /**
     * The doclet writes a source map beside [outputFile] which the lint tasks read, so it has to be
     * declared: otherwise Gradle treats the task as complete, or restores it from the cache, with the
     * map missing. Derive it with [apiMapFileFor] so the name stays in step with [outputFile].
     */
    @get:OutputFile
    abstract val apiMapFile: RegularFileProperty

    @get:Input
    abstract val packageFilter: Property<String>

    @get:Input
    abstract val skipClassesRegex: ListProperty<String>

    /**
     * Serves only to make the paths recorded in [apiMapFile] relative, so it stays out of the cache
     * key: the outputs hold no absolute paths, and including this one would stop cache entries being
     * shared between checkouts.
     */
    @get:Internal
    abstract val rootDir: Property<String>

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sourcePath: ConfigurableFileCollection

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val docletPath: RegularFileProperty

    @TaskAction
    override fun generate() {
        val opts = options as StandardJavadocDocletOptions
        opts.doclet = "org.mozilla.doclet.ApiDoclet"
        opts.docletpath = listOf(docletPath.get().asFile)

        // Gradle sends -notimestamp automatically which is not compatible to
        // doclets, so we have to work around it here,
        // see: https://github.com/gradle/gradle/issues/11898
        opts.noTimestamp(false)

        opts.addStringOption("output", outputFile.get().asFile.absolutePath)
        opts.addStringOption("subpackages", packageFilter.get())
        opts.addPathOption("sourcepath").setValue(sourcePath.files.toList())
        opts.addStringOption("root-dir", rootDir.get())
        opts.addStringOption("skip-class-regex", skipClassesRegex.get().joinToString(":"))

        super.generate()
    }
}

/**
 * The API map that the doclet writes when handed [apiFile]: it appends `.map` to the output name, and
 * the lint tasks read it back, so both sides derive the path from here rather than repeating it.
 */
internal fun apiMapFileFor(layout: ProjectLayout, apiFile: Provider<RegularFile>): Provider<RegularFile> =
    layout.file(apiFile.map { File("${it.asFile.path}.map") })
