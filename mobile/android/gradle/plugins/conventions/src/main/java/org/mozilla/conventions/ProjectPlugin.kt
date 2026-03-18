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

class ProjectPlugin : Plugin<Project> {
    @Suppress("UNCHECKED_CAST")
    override fun apply(project: Project) {
        val extraProperties = project.gradle.extensions.extraProperties
        val mozconfig = extraProperties["mozconfig"] as Map<String, Any>
        val topobjdir = mozconfig["topobjdir"] as String
        val substs = mozconfig["substs"] as Map<String, Any>
        val configureMavenRepositories = extraProperties["configureMavenRepositories"] as groovy.lang.Closure<*>

        project.repositories.apply {
            configureMavenRepositories.call(this)
            maven { setUrl("${topobjdir}/gradle/maven") }
        }

        configureAppServicesSubstitution(project, extraProperties, substs)
        configureGleanSubstitution(project, extraProperties)
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

    companion object {
        private const val LOCAL_SNAPSHOT_VERSION = "0.0.1-SNAPSHOT-+"
        private val APP_SERVICES_GROUPS = setOf("org.mozilla.appservices", "org.mozilla.appservices.nightly")
        private val GLEAN_GROUPS = setOf("org.mozilla.telemetry")
    }
}
