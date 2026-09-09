/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import com.android.build.api.variant.LibraryAndroidComponentsExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Copy
import org.gradle.api.tasks.PathSensitivity

class ApiLintPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        val extension = project.extensions.create("apiLint", ApiLintPluginExtension::class.java)

        project.pluginManager.withPlugin("com.android.library") {
            val docletJarFile = project.layout.buildDirectory.file("docletJar/apidoc-plugin.jar")
            val resourceName = "apidoc-plugin.jar"

            val copyDocletJarResource =
                project.tasks.register("copyDocletJarResource") {
                    inputs.property("resourceName", resourceName)
                    outputs.file(docletJarFile)
                    doLast {
                        val resourceStream =
                            ApiLintPlugin::class.java.classLoader.getResourceAsStream(resourceName)
                                ?: throw RuntimeException("Java resource not found: $resourceName")
                        resourceStream.use { input ->
                            outputs.files.singleFile.outputStream().use { out ->
                                input.copyTo(out)
                            }
                        }
                    }
                }

            val androidComponents = project.extensions.getByType(LibraryAndroidComponentsExtension::class.java)
            androidComponents.onVariants(androidComponents.selector().all()) { variant ->
                val variantName = variant.name
                val name = variantName.replaceFirstChar { c -> c.titlecase() }

                // A dedicated, variant-scoped directory: the variant API does not hand out the
                // javac output directory at configuration time.
                val outputDir = project.layout.buildDirectory.dir("apilint/$variantName")
                val apiFileProvider = outputDir.flatMap { dir -> extension.apiOutputFileName.map { dir.file(it) } }
                val jsonResultFileProvider = outputDir.flatMap { dir ->
                    extension.jsonResultFileName.map { dir.file(it) }
                }
                val currentApiFileProvider = project.layout.projectDirectory.file(extension.currentApiRelativeFilePath)
                val apiMapFileProvider = apiMapFileFor(project.layout, apiFileProvider)

                // sources.java.all covers the static sources plus the AGP-generated BuildConfig/AIDL
                // sources (replacing the legacy sourceSets/generateBuildConfig/aidlCompile accessors).
                // Generated non-API types (BuildConfig, R) are filtered by skipClassesRegex/exclude below.
                val javaSources = variant.sources.java ?: return@onVariants
                val sourceDirs = javaSources.all

                val apiGenerate =
                    project.tasks.register("apiGenerate$name", ApiCompatLintTask::class.java) {
                        description = "Generates API file for build variant $name"
                        dependsOn(copyDocletJarResource)
                        // The variant's compile classpath covers the dependencies but not the
                        // platform, and javadoc cannot resolve `android.*` without it.
                        classpath =
                            project.files(
                                androidComponents.sdkComponents.bootClasspath,
                                variant.compileClasspath,
                            )

                        setSource(sourceDirs)
                        exclude("**/R.java")
                        include("**/**.java")

                        sourcePath.from(sourceDirs)

                        rootDir.set(project.rootDir.absolutePath)
                        outputFile.set(apiFileProvider)
                        apiMapFile.set(apiMapFileProvider)
                        packageFilter.set(extension.packageFilter)
                        skipClassesRegex.set(extension.skipClassesRegex)
                        destinationDir = project.layout.buildDirectory.dir("tmp/javadoc/$variantName").get().asFile
                        docletPath.set(docletJarFile)
                    }

                val apiLintSingle =
                    project.tasks.register("apiLintSingle$name", PythonExec::class.java) {
                        description = "Runs API lint checks for variant $name"
                        dependsOn(apiGenerate)
                        scriptPath.set("apilint.py")

                        inputs.file(apiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        inputs.file(apiMapFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        declareLintFilterInputs(extension)
                        declareDeprecationInputs(extension)
                        outputs.file(jsonResultFileProvider)

                        doFirst {
                            val apiFile = apiFileProvider.get().asFile
                            val jsonResultFile = jsonResultFileProvider.get().asFile
                            val apiMapFile = apiMapFileProvider.get().asFile

                            args(apiFile, "--result-json", jsonResultFile)
                            // Gradle gives a ListProperty an empty value rather than no value, so these
                            // have to be checked for emptiness: `isPresent` is true even when the
                            // consumer never configured them, and passing either flag with no values
                            // makes apilint.py restrict the API to nothing.
                            val lintFilters = extension.lintFilters.get()
                            if (lintFilters.isNotEmpty()) {
                                args("--filter-errors", *lintFilters.toTypedArray())
                            }
                            val allowedPackages = extension.allowedPackages.get()
                            if (allowedPackages.isNotEmpty()) {
                                args("--allowed-packages", *allowedPackages.toTypedArray())
                            }
                            if (extension.deprecationAnnotation.isPresent) {
                                args("--deprecation-annotation", extension.deprecationAnnotation.get())
                            }
                            if (extension.libraryVersion.isPresent) {
                                args("--library-version", extension.libraryVersion.get())
                            }
                            args("--api-map", apiMapFile)
                        }
                    }

                val apiDiff =
                    project.tasks.register("apiDiff$name", PythonExec::class.java) {
                        description = "Prints the diff between the existing API and the local API."
                        group = "Verification"
                        dependsOn(apiGenerate)
                        scriptPath.set("diff.py")

                        inputs.file(apiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        inputs.file(currentApiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)

                        // diff exit value is != 0 if the files are different
                        isIgnoreExitValue = true

                        doFirst {
                            val apiFile = apiFileProvider.get().asFile
                            val currentApiFile = currentApiFileProvider.get().asFile

                            args(
                                "--existing",
                                currentApiFile,
                                "--local",
                                apiFile,
                                "--command",
                                extension.helpCommand.get()(name),
                            )
                        }
                    }

                val apiCompatLint =
                    project.tasks.register("apiCompatLint$name", PythonExec::class.java) {
                        description = "Runs API compatibility lint checks for variant $name"
                        scriptPath.set("apilint.py")

                        inputs.file(apiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        inputs.file(currentApiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        inputs.file(apiMapFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                        declareDeprecationInputs(extension)
                        outputs.file(jsonResultFileProvider)
                        // Appends to the result file `apiLintSingle` writes. A cache hit would restore a
                        // whole copy of that file rather than appending to the current one, so what
                        // `apiLintSingle` just wrote would be replaced by whatever it held when this
                        // entry was stored.
                        outputs.cacheIf { false }

                        dependsOn(apiLintSingle)
                        finalizedBy(apiDiff)

                        doFirst {
                            val apiFile = apiFileProvider.get().asFile
                            val jsonResultFile = jsonResultFileProvider.get().asFile
                            val currentApiFile = currentApiFileProvider.get().asFile
                            val apiMapFile = apiMapFileProvider.get().asFile

                            args(
                                "--show-noticed",
                                apiFile,
                                currentApiFile,
                                "--result-json",
                                jsonResultFile,
                                "--append-json",
                                "--api-map",
                                apiMapFile,
                            )
                            if (extension.deprecationAnnotation.isPresent) {
                                args("--deprecation-annotation", extension.deprecationAnnotation.get())
                            }
                            if (extension.libraryVersion.isPresent) {
                                args("--library-version", extension.libraryVersion.get())
                            }
                        }
                    }

                val lintDependency =
                    if (extension.changelogFileName.isPresent) {
                        val changelogFileProvider = project.layout.projectDirectory.file(extension.changelogFileName)
                        project.tasks.register("apiChangelogCheck$name", PythonExec::class.java) {
                            description = "Checks that the API changelog has been updated."
                            group = "Verification"
                            scriptPath.set("changelog-check.py")

                            inputs.file(apiFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                            inputs.file(changelogFileProvider).withPathSensitivity(PathSensitivity.RELATIVE)
                            outputs.file(jsonResultFileProvider)
                            // Shares the result file with the tasks above, so the same restore hazard
                            // applies.
                            outputs.cacheIf { false }

                            dependsOn(apiCompatLint)

                            doFirst {
                                val apiFile = apiFileProvider.get().asFile
                                val jsonResultFile = jsonResultFileProvider.get().asFile
                                val changelogFile = changelogFileProvider.get().asFile

                                args(
                                    "--api-file",
                                    apiFile,
                                    "--changelog-file",
                                    changelogFile,
                                    "--result-json",
                                    jsonResultFile,
                                )
                            }
                        }
                    } else {
                        apiCompatLint
                    }

                val apiLint =
                    project.tasks.register("apiLint$name") {
                        description = "Runs API lint checks for variant $name"
                        group = "Verification"
                        dependsOn(lintDependency)
                    }

                project.tasks.named("check") {
                    dependsOn(apiLint)
                }

                project.tasks.register("apiUpdateFile$name", Copy::class.java) {
                    description = "Updates the API file from the local one for variant $name"
                    group = "Verification"
                    dependsOn(apiGenerate)
                    from(apiFileProvider)
                    into(currentApiFileProvider.map { it.asFile.parentFile })
                    rename { currentApiFileProvider.get().asFile.name }
                }
            }
        }
    }
}
