/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import com.android.build.gradle.LibraryExtension
import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Copy
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

class ApiLintPlugin : Plugin<Project> {
    private fun copyResourceToTemp(resource: String, prefix: String, suffix: String): File {
        var tempFile: File? = null
        try {
            val script = javaClass.classLoader.getResourceAsStream(resource)
            tempFile = File.createTempFile(prefix, suffix)
            Files.copy(script, Paths.get(tempFile.absolutePath), StandardCopyOption.REPLACE_EXISTING)
            return tempFile
        } catch (ex: IOException) {
            tempFile?.delete()
            throw RuntimeException(ex)
        }
    }

    @Suppress("DEPRECATION")
    override fun apply(project: Project) {
        val extension = project.extensions.create("apiLint", ApiLintPluginExtension::class.java)

        val android = project.plugins.findPlugin("android-library")
        if (android == null) {
            throw GradleException("You need the Android Library plugin to run ApiLint.")
        }

        val copyDocletJarResource = project.tasks.create("copyDocletJarResource") { task ->
            val resourceName = "apidoc-plugin.jar"
            val destinationFile = "${project.buildDir}/docletJar/${resourceName}"
            task.outputs.file(destinationFile)
            task.doLast {
                val resourceStream = ApiLintPlugin::class.java.classLoader.getResourceAsStream(resourceName)
                if (resourceStream != null) {
                    task.outputs.files.singleFile.outputStream().use { out ->
                        resourceStream.copyTo(out)
                    }
                    resourceStream.close()
                } else {
                    throw IOException("Java resource not found: $resourceName")
                }
            }
        }

        // TODO: support applications
        val libraryExtension = project.extensions.getByType(LibraryExtension::class.java)
        libraryExtension.libraryVariants.all { variant ->
            val name = variant.name.replaceFirstChar { c -> c.titlecase() }
            val apiFileName = "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.apiOutputFileName}"
            val apiFile = project.file(apiFileName)
            val variantClasspath = variant.javaCompileProvider.get().classpath

            val currentApiFile = project.file(extension.currentApiRelativeFilePath)

            val apiGenerate = project.tasks.create("apiGenerate${name}", ApiCompatLintTask::class.java) { task ->
                task.description = "Generates API file for build variant ${name}"
                task.doFirst {
                    task.classpath = variantClasspath
                }

                task.setSource(variant.sourceSets.map { it.javaDirectories })
                task.exclude("**/R.java")
                task.include("**/**.java")

                task.sourcePath =
                    variant.sourceSets.flatMap { it.javaDirectories } +
                    variant.generateBuildConfigProvider.get().sourceOutputDir.asFile.get() +
                    variant.aidlCompileProvider.get().sourceOutputDir.asFile.get()

                task.rootDir = project.rootDir.toString()
                task.outputFile = apiFile
                task.packageFilter = extension.packageFilter
                task.skipClassesRegex = extension.skipClassesRegex
                task.destinationDir = File(task.destinationDir, variant.baseName)

                task.docletPath = copyDocletJarResource.outputs.files.singleFile
            }
            apiGenerate.dependsOn(copyDocletJarResource)
            apiGenerate.dependsOn(variant.javaCompileProvider.get())
            apiGenerate.dependsOn(variant.aidlCompileProvider.get())
            apiGenerate.dependsOn(variant.generateBuildConfigProvider.get())

            val apiCompatLint = project.tasks.create("apiCompatLint${name}", PythonExec::class.java) { task ->
                task.description = "Runs API compatibility lint checks for variant ${name}"
                task.scriptPath.set("apilint.py")
                task.args("--show-noticed")
                task.args(apiFile)
                task.args(currentApiFile)
                task.args("--result-json")
                task.args(project.file(
                        "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}"))
                task.args("--append-json")
                task.args("--api-map")
                task.args(project.file(apiFileName + ".map"))
                if (extension.deprecationAnnotation != null) {
                    task.args("--deprecation-annotation")
                    task.args(extension.deprecationAnnotation!!)
                }
                if (extension.libraryVersion != null) {
                    task.args("--library-version")
                    task.args(extension.libraryVersion!!)
                }
            }

            apiCompatLint.dependsOn(apiGenerate)

            val apiLintSingle = project.tasks.create("apiLintSingle${name}", PythonExec::class.java) { task ->
                task.description = "Runs API lint checks for variant ${name}"
                task.scriptPath.set("apilint.py")
                task.args(apiFile)
                task.args("--result-json")
                task.args(project.file(
                        "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}"))
                if (extension.lintFilters != null) {
                    task.args("--filter-errors")
                    task.args(extension.lintFilters!!)
                }
                if (extension.allowedPackages != null) {
                    task.args("--allowed-packages")
                    task.args(extension.allowedPackages!!)
                }
                if (extension.deprecationAnnotation != null) {
                    task.args("--deprecation-annotation")
                    task.args(extension.deprecationAnnotation!!)
                }
                if (extension.libraryVersion != null) {
                    task.args("--library-version")
                    task.args(extension.libraryVersion!!)
                }
                task.args("--api-map")
                task.args(project.file(apiFileName + ".map"))
            }

            apiCompatLint.dependsOn(apiLintSingle)
            apiLintSingle.dependsOn(apiGenerate)

            val apiLint = project.tasks.create("apiLint${name}") { task ->
                task.description = "Runs API lint checks for variant ${name}"
                task.group = "Verification"
            }

            if (extension.changelogFileName != null) {
                val apiChangelogCheck = project.tasks.create("apiChangelogCheck${name}", PythonExec::class.java) { task ->
                    task.description = "Checks that the API changelog has been updated."
                    task.group = "Verification"
                    task.scriptPath.set("changelog-check.py")
                    task.args("--api-file")
                    task.args(apiFile)
                    task.args("--changelog-file")
                    task.args(project.file(extension.changelogFileName!!))
                    task.args("--result-json")
                    task.args(project.file(
                            "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}"))
                }

                apiChangelogCheck.dependsOn(apiGenerate)
                apiChangelogCheck.dependsOn(apiCompatLint)
                apiLint.dependsOn(apiChangelogCheck)
            } else {
                apiLint.dependsOn(apiLintSingle)
            }

            project.tasks.named("check").configure {
                it.dependsOn(apiLint)
            }

            val apiDiff = project.tasks.create("apiDiff${name}", PythonExec::class.java) { task ->
                task.description = "Prints the diff between the existing API and the local API."
                task.group = "Verification"
                task.scriptPath.set("diff.py")
                task.args("--existing", currentApiFile)
                task.args("--local", apiFile)
                task.args("--command", extension.helpCommand(name))

                // diff exit value is != 0 if the files are different
                task.isIgnoreExitValue = true
            }

            apiCompatLint.finalizedBy(apiDiff)

            val apiUpdate = project.tasks.create("apiUpdateFile${name}", Copy::class.java) { task ->
                task.description = "Updates the API file from the local one for variant ${name}"
                task.group = "Verification"
                task.from(apiFile)
                task.into(currentApiFile.parent)
                task.rename { apiFile.name }
            }

            apiUpdate.dependsOn(apiGenerate)
        }
    }
}
