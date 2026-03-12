/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.javadoc.Javadoc
import org.gradle.external.javadoc.StandardJavadocDocletOptions
import java.io.File

abstract class ApiCompatLintTask : Javadoc() {
    @get:OutputFile
    lateinit var outputFile: File

    @get:Input
    lateinit var packageFilter: String

    @get:Input
    var skipClassesRegex: List<String> = emptyList()

    @get:Input
    lateinit var rootDir: String

    @get:InputFiles
    var sourcePath: List<File> = emptyList()

    @get:InputFile
    lateinit var docletPath: File

    @TaskAction
    override fun generate() {
        val opts = options as StandardJavadocDocletOptions
        opts.doclet = "org.mozilla.doclet.ApiDoclet"
        opts.docletpath = listOf(docletPath)

        // Gradle sends -notimestamp automatically which is not compatible to
        // doclets, so we have to work around it here,
        // see: https://github.com/gradle/gradle/issues/11898
        opts.noTimestamp(false)

        opts.addStringOption("output", outputFile.absolutePath)
        opts.addStringOption("subpackages", packageFilter)
        opts.addPathOption("sourcepath").setValue(sourcePath)
        opts.addStringOption("root-dir", rootDir)
        opts.addStringOption("skip-class-regex", skipClassesRegex.joinToString(":"))

        super.generate()
    }
}
