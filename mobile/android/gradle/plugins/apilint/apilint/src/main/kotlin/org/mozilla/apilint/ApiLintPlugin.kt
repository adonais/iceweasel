/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import com.android.build.gradle.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Copy

class ApiLintPlugin : Plugin<Project> {
    @Suppress("DEPRECATION")
    override fun apply(project: Project) {
        val extension = project.extensions.create("apiLint", ApiLintPluginExtension::class.java)

        project.pluginManager.withPlugin("com.android.library") {
            val docletJarFile = project.layout.buildDirectory.file("docletJar/apidoc-plugin.jar")
            val resourceName = "apidoc-plugin.jar"

            val copyDocletJarResource = project.tasks.register("copyDocletJarResource") { task ->
                task.inputs.property("resourceName", resourceName)
                task.outputs.file(docletJarFile)
                task.doLast {
                    val resourceStream = ApiLintPlugin::class.java.classLoader.getResourceAsStream(resourceName)
                        ?: throw RuntimeException("Java resource not found: $resourceName")
                    resourceStream.use { input ->
                        task.outputs.files.singleFile.outputStream().use { out ->
                            input.copyTo(out)
                        }
                    }
                }
            }

            val libraryExtension = project.extensions.getByType(LibraryExtension::class.java)
            libraryExtension.libraryVariants.configureEach { variant ->
                val name = variant.name.replaceFirstChar { c -> c.titlecase() }

                val destDirProvider = variant.javaCompileProvider.flatMap { it.destinationDirectory }
                val apiFileProvider = destDirProvider.flatMap { dir -> extension.apiOutputFileName.map { dir.file(it) } }
                val jsonResultFileProvider = destDirProvider.flatMap { dir -> extension.jsonResultFileName.map { dir.file(it) } }
                val currentApiFileProvider = project.layout.projectDirectory.file(extension.currentApiRelativeFilePath)
                val apiMapFileProvider = destDirProvider.flatMap { dir ->
                    extension.apiOutputFileName.map { dir.file("${it}.map") }
                }

                val apiGenerate = project.tasks.register("apiGenerate${name}", ApiCompatLintTask::class.java) { task ->
                    task.description = "Generates API file for build variant ${name}"
                    task.dependsOn(copyDocletJarResource)
                    task.classpath = project.files(variant.javaCompileProvider.map { it.classpath })

                    task.setSource(variant.sourceSets.map { it.javaDirectories })
                    task.exclude("**/R.java")
                    task.include("**/**.java")

                    task.sourcePath.from(
                        variant.sourceSets.flatMap { it.javaDirectories },
                        variant.generateBuildConfigProvider.flatMap { it.sourceOutputDir },
                        variant.aidlCompileProvider.flatMap { it.sourceOutputDir }
                    )

                    task.rootDir.set(project.rootDir.absolutePath)
                    task.outputFile.set(apiFileProvider)
                    task.packageFilter.set(extension.packageFilter)
                    task.skipClassesRegex.set(extension.skipClassesRegex)
                    task.javadocDestinationDir.set(project.layout.buildDirectory.dir("tmp/javadoc/${variant.baseName}"))
                    task.docletPath.set(docletJarFile)
                }

                val apiLintSingle = project.tasks.register("apiLintSingle${name}", PythonExec::class.java) { task ->
                    task.description = "Runs API lint checks for variant ${name}"
                    task.dependsOn(apiGenerate)
                    task.scriptPath.set("apilint.py")

                    task.inputs.file(apiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.inputs.file(apiMapFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.outputs.file(jsonResultFileProvider)

                    task.doFirst {
                        val apiFile = apiFileProvider.get().asFile
                        val jsonResultFile = jsonResultFileProvider.get().asFile
                        val apiMapFile = apiMapFileProvider.get().asFile

                        task.args(apiFile, "--result-json", jsonResultFile)
                        if (extension.lintFilters.isPresent) {
                            task.args("--filter-errors", *extension.lintFilters.get().toTypedArray())
                        }
                        if (extension.allowedPackages.isPresent) {
                            task.args("--allowed-packages", *extension.allowedPackages.get().toTypedArray())
                        }
                        if (extension.deprecationAnnotation.isPresent) {
                            task.args("--deprecation-annotation", extension.deprecationAnnotation.get())
                        }
                        if (extension.libraryVersion.isPresent) {
                            task.args("--library-version", extension.libraryVersion.get())
                        }
                        task.args("--api-map", apiMapFile)
                    }
                }

                val apiDiff = project.tasks.register("apiDiff${name}", PythonExec::class.java) { task ->
                    task.description = "Prints the diff between the existing API and the local API."
                    task.group = "Verification"
                    task.dependsOn(apiGenerate)
                    task.scriptPath.set("diff.py")

                    task.inputs.file(apiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.inputs.file(currentApiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)

                    // diff exit value is != 0 if the files are different
                    task.isIgnoreExitValue = true

                    task.doFirst {
                        val apiFile = apiFileProvider.get().asFile
                        val currentApiFile = currentApiFileProvider.get().asFile

                        task.args("--existing", currentApiFile, "--local", apiFile, "--command", extension.helpCommand.get()(name).toString())
                    }
                }

                val apiCompatLint = project.tasks.register("apiCompatLint${name}", PythonExec::class.java) { task ->
                    task.description = "Runs API compatibility lint checks for variant ${name}"
                    task.scriptPath.set("apilint.py")

                    task.inputs.file(apiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.inputs.file(currentApiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.inputs.file(apiMapFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                    task.outputs.file(jsonResultFileProvider)

                    task.dependsOn(apiLintSingle)
                    task.finalizedBy(apiDiff)

                    task.doFirst {
                        val apiFile = apiFileProvider.get().asFile
                        val jsonResultFile = jsonResultFileProvider.get().asFile
                        val currentApiFile = currentApiFileProvider.get().asFile
                        val apiMapFile = apiMapFileProvider.get().asFile

                        task.args("--show-noticed", apiFile, currentApiFile, "--result-json", jsonResultFile, "--append-json", "--api-map", apiMapFile)
                        if (extension.deprecationAnnotation.isPresent) {
                            task.args("--deprecation-annotation", extension.deprecationAnnotation.get())
                        }
                        if (extension.libraryVersion.isPresent) {
                            task.args("--library-version", extension.libraryVersion.get())
                        }
                    }
                }

                val lintDependency = if (extension.changelogFileName.isPresent) {
                    val changelogFileProvider = project.layout.projectDirectory.file(extension.changelogFileName)
                    project.tasks.register("apiChangelogCheck${name}", PythonExec::class.java) { changelogTask ->
                        changelogTask.description = "Checks that the API changelog has been updated."
                        changelogTask.group = "Verification"
                        changelogTask.scriptPath.set("changelog-check.py")

                        changelogTask.inputs.file(apiFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                        changelogTask.inputs.file(changelogFileProvider).withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
                        changelogTask.outputs.file(jsonResultFileProvider)

                        changelogTask.dependsOn(apiCompatLint)

                        changelogTask.doFirst {
                            val apiFile = apiFileProvider.get().asFile
                            val jsonResultFile = jsonResultFileProvider.get().asFile
                            val changelogFile = changelogFileProvider.get().asFile

                            changelogTask.args("--api-file", apiFile, "--changelog-file", changelogFile, "--result-json", jsonResultFile)
                        }
                    }
                } else {
                    apiCompatLint
                }

                val apiLint = project.tasks.register("apiLint${name}") { task ->
                    task.description = "Runs API lint checks for variant ${name}"
                    task.group = "Verification"
                    task.dependsOn(lintDependency)
                }

                project.tasks.named("check") {
                    it.dependsOn(apiLint)
                }

                project.tasks.register("apiUpdateFile${name}", Copy::class.java) { task ->
                    task.description = "Updates the API file from the local one for variant ${name}"
                    task.group = "Verification"
                    task.dependsOn(apiGenerate)
                    task.from(apiFileProvider)
                    task.into(currentApiFileProvider.map { it.asFile.parentFile })
                    task.rename { extension.apiOutputFileName.get() }
                }
            }
        }
    }
}
