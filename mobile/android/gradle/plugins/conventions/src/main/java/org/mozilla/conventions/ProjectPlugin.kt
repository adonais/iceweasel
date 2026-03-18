/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions

import org.gradle.api.Action
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.Configuration
import org.gradle.api.artifacts.DependencySubstitution
import org.gradle.api.artifacts.component.ModuleComponentSelector
import org.gradle.api.logging.StandardOutputListener
import org.gradle.api.plugins.AppliedPlugin
import java.io.File

class ProjectPlugin : Plugin<Project> {
    @Suppress("UNCHECKED_CAST")
    override fun apply(project: Project) {
        project.extensions.create("mozilla", ProjectExtension::class.java).apply {
            androidComponentsProject.convention(false)
        }

        val extraProperties = project.gradle.extensions.extraProperties
        val mozconfig = extraProperties["mozconfig"] as Map<String, Any>
        val topsrcdir = mozconfig["topsrcdir"] as String
        val topobjdir = mozconfig["topobjdir"] as String
        val substs = mozconfig["substs"] as Map<String, Any>
        val configureMavenRepositories = extraProperties["configureMavenRepositories"] as groovy.lang.Closure<*>

        project.repositories.apply {
            configureMavenRepositories.call(this)
            maven { setUrl("${topobjdir}/gradle/maven") }
        }

        configureBuildDirectory(project, topsrcdir, topobjdir)
        configureJniKeepDebugSymbols(project)
        configureKotlinCompilerMessageReformatting(project)
        configureKotlinWarningsAsErrors(project)
        configureAndroidBuildToolsVersion(project, substs)
        configureAppServicesSubstitution(project, extraProperties, substs)
        configureGleanSubstitution(project, extraProperties)
    }

    // Initialize the project buildDir to be in ${topobjdir} to follow
    // conventions of mozilla-central build system.
    private fun configureBuildDirectory(project: Project, topsrcdir: String, topobjdir: String) {
        val topSrcPath = File(topsrcdir).toPath()
        val topObjPath = File(topobjdir).toPath()

        val sourcePath = project.buildFile.toPath().parent
        val relativePath = topSrcPath.relativize(sourcePath)

        if (relativePath.startsWith("..")) {
            // The project doesn't appear to be in topsrcdir so leave the
            // buildDir alone.
        } else {
            // Transplant the project path into "${topobjdir}/gradle/build".
            // This is consistent with existing gradle / taskcluster
            // configurations but less consistent with the result of the
            // non-gradle build system.
            project.layout.buildDirectory.set(topObjPath.resolve("gradle/build").resolve(relativePath).toFile())
        }
    }

    // This explicitly disables stripping of native libraries in our projects to match the existing
    // implicit behaviour. Our projects do not specify the `ndkVersion` for our main Android builds
    // and so stripping would otherwise fail with a warning. Note that gecko builds themselves will
    // already strip the *.so files when compiled as release targets.
    @Suppress("UNCHECKED_CAST")
    private fun configureJniKeepDebugSymbols(project: Project) {
        val action = Action<AppliedPlugin> {
            val android = project.extensions.getByName("android")
            val packagingOptions = android.javaClass.getMethod("getPackagingOptions").invoke(android)
            val jniLibs = packagingOptions.javaClass.getMethod("getJniLibs").invoke(packagingOptions)
            val keepDebugSymbols = jniLibs.javaClass.getMethod("getKeepDebugSymbols").invoke(jniLibs)
            (keepDebugSymbols as MutableSet<String>).add("**/*.so")
        }
        project.pluginManager.withPlugin("com.android.library", action)
        project.pluginManager.withPlugin("com.android.application", action)
    }

    private fun configureAppServicesSubstitution(
        project: Project,
        extraProperties: org.gradle.api.plugins.ExtraPropertiesExtension,
        substs: Map<String, Any>,
    ) {
        if (substs["MOZ_APPSERVICES_IN_TREE"].isTruthy()) {
            // In tree, so we update our legacy "external" dep name to a local project.
            // e.g., "org.mozilla.appservices:syncmanager:X.Y.Z" becomes project(':syncmanager')
            substituteDependencies(project, APP_SERVICES_GROUPS) { group, module, dependency ->
                var name = module
                // full-megazord-libsForTests is a convenience; we don't lose test coverage,
                // just local test convenience.
                if (name == "full-megazord-libsForTests") {
                    name = "full-megazord"
                }
                dependency.useTarget(project.project(":$name"))
            }
        } else if (extraProperties.has("localProperties.autoPublish.application-services.dir")) {
            substituteWithMavenLocal(project, "local-appservices", APP_SERVICES_GROUPS, "org.mozilla.appservices")
        }
    }

    private fun configureGleanSubstitution(
        project: Project,
        extraProperties: org.gradle.api.plugins.ExtraPropertiesExtension
    ) {
        if (extraProperties.has("localProperties.autoPublish.glean.dir")) {
            substituteWithMavenLocal(project, "local-glean", GLEAN_GROUPS)
        }
    }

    // Substitutes dependencies to use locally published versions from mavenLocal.
    private fun substituteWithMavenLocal(
        project: Project,
        tag: String,
        groups: Set<String>,
        targetGroup: String? = null
    ) {
        project.logger.lifecycle("[$tag] adjusting $project to use locally published modules ($LOCAL_SNAPSHOT_VERSION)")
        project.repositories.mavenLocal()
        substituteDependencies(project, groups) { group, module, dependency ->
            dependency.useTarget(
                mapOf(
                    "group" to (targetGroup ?: group),
                    "name" to module,
                    "version" to LOCAL_SNAPSHOT_VERSION
                )
            )
        }
    }

    private fun substituteDependencies(
        project: Project,
        groups: Set<String>,
        action: (group: String, module: String, dependency: DependencySubstitution) -> Unit
    ) {
        project.configurations.configureEach(object : Action<Configuration> {
            override fun execute(config: Configuration) {
                if (config.isCanBeResolved) {
                    config.resolutionStrategy.dependencySubstitution.all(object : Action<DependencySubstitution> {
                        override fun execute(dependency: DependencySubstitution) {
                            val requested = dependency.requested
                            if (requested is ModuleComponentSelector && requested.group in groups) {
                                action(requested.group, requested.module, dependency)
                            }
                        }
                    })
                }
            }
        })
    }

    private fun configureKotlinCompilerMessageReformatting(project: Project) {
        // Kotlin compiler message formats:
        // - Current: "e: file.kt:10:5 message" (colon-separated, used by fenix/focus/A-C)
        // - Legacy:  "e: file.kt: (10, 5): message" (parenthesized, used by geckoview)
        val messageFormats = listOf(
            Regex("""([ew]): (.+):(\d+):(\d+) (.*)"""),
            Regex("""([ew]): (.+): \((\d+), (\d+)\): (.*)"""),
        )

        project.tasks.configureEach {
            if (!this::class.java.name.startsWith("org.jetbrains.kotlin.gradle.tasks.KotlinCompile")) {
                return@configureEach
            }

            // Translate Kotlin messages like "w: ..." and "e: ..." into
            // "...: warning: ..." and "...: error: ...", to make Treeherder understand.
            val listener = StandardOutputListener { message ->
                if (message.startsWith("e: warnings found")) {
                    return@StandardOutputListener
                }

                if (message.startsWith("w: ") || message.startsWith("e: ")) {
                    val match = messageFormats.firstNotNullOfOrNull { it.find(message) }
                    if (match == null) {
                        logger.quiet("kotlinc message format has changed!")
                        // For warnings, don't continue because we don't want to throw an
                        // exception. For errors, we want the exception so that the new error
                        // message format gets translated properly.
                        if (message.startsWith("w: ")) {
                            return@StandardOutputListener
                        }
                    }
                    match?.let {
                        val (type, file, line, column, msg) = it.destructured
                        val level = if (type == "w") "warning" else "error"
                        // Use logger.lifecycle, which does not go through stderr again.
                        logger.lifecycle("$file:$line:$column: $level: $msg")
                    }
                }
            }

            doFirst {
                logging.addStandardErrorListener(listener)
            }
            doLast {
                logging.removeStandardErrorListener(listener)
            }
        }
    }

    private fun configureKotlinWarningsAsErrors(project: Project) {
        project.tasks.configureEach {
            if (!this::class.java.name.startsWith("org.jetbrains.kotlin.gradle.tasks.KotlinCompile")) {
                return@configureEach
            }
            val compilerOptions = this::class.java.getMethod("getCompilerOptions").invoke(this)
            val allWarningsAsErrors = compilerOptions::class.java.getMethod("getAllWarningsAsErrors").invoke(compilerOptions)
            allWarningsAsErrors::class.java.getMethod("set", Any::class.java).invoke(allWarningsAsErrors, true)
        }
    }

    private fun configureAndroidBuildToolsVersion(project: Project, substs: Map<String, Any>) {
        val buildToolsVersion = substs["ANDROID_BUILD_TOOLS_VERSION"] as String

        // Use android plugin id string and reflection to avoid classloader isolation issues
        project.pluginManager.withPlugin("com.android.base") {
            val android = project.extensions.findByName("android") ?: return@withPlugin
            android::class.java.getMethod("setBuildToolsVersion", String::class.java)
                .invoke(android, buildToolsVersion)
        }
    }

    companion object {
        private const val LOCAL_SNAPSHOT_VERSION = "0.0.1-SNAPSHOT-+"
        private val APP_SERVICES_GROUPS = setOf("org.mozilla.appservices", "org.mozilla.appservices.nightly")
        private val GLEAN_GROUPS = setOf("org.mozilla.telemetry")
    }
}
