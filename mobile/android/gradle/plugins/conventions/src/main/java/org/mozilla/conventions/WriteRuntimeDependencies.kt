/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions

import groovy.json.JsonOutput
import org.gradle.api.Action
import org.gradle.api.DefaultTask
import org.gradle.api.artifacts.ArtifactView
import org.gradle.api.artifacts.Configuration
import org.gradle.api.artifacts.component.ComponentIdentifier
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.result.ResolvedArtifactResult
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.provider.Provider
import org.gradle.api.provider.SetProperty
import org.gradle.api.specs.Spec
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction

/**
 * Writes the resolved closure of a runtime classpath, which is what a variant
 * packages, for the SBOM: see python/mozbuild/mozbuild/vendor/sbom_gradle.py,
 * which reads the output.
 */
abstract class WriteRuntimeDependencies : DefaultTask() {
    @get:Input
    abstract val rootComponent: Property<ResolvedComponentResult>

    @get:Internal
    abstract val artifacts: SetProperty<ResolvedArtifactResult>

    /** The product's version, which the SBOM records, where it has one. */
    @get:Input
    @get:Optional
    abstract val versionName: Property<String>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    init {
        outputs.upToDateWhen { false }
    }

    /** Describe the closure of [configuration], a runtime classpath. */
    fun classpath(configuration: Provider<Configuration>) {
        rootComponent.set(configuration.flatMap { it.incoming.resolutionResult.rootComponent })
        // Modules only: a project's artifacts would have to be built first, and
        // they are our own code rather than a dependency. Resolving them fails
        // the task if any dependency is unresolved.
        artifacts.set(
            configuration.flatMap {
                it.incoming.artifactView(
                    Action<ArtifactView.ViewConfiguration> {
                        componentFilter(Spec<ComponentIdentifier> { id -> id is ModuleComponentIdentifier })
                    },
                ).artifacts.resolvedArtifacts
            },
        )
    }

    @TaskAction
    fun write() {
        val files = mutableMapOf<String, MutableList<String>>()
        artifacts.get().forEach { artifact ->
            val id = artifact.id.componentIdentifier as? ModuleComponentIdentifier ?: return@forEach
            files.getOrPut(key(id)) { mutableListOf() }.add(artifact.file.absolutePath)
        }

        val components = sortedMapOf<String, Map<String, Any>>()
        val seen = mutableSetOf<ComponentIdentifier>()
        val queue = ArrayDeque(listOf(rootComponent.get()))
        while (queue.isNotEmpty()) {
            val component = queue.removeLast()
            if (!seen.add(component.id)) {
                continue
            }
            val children = component.dependencies
                .filterIsInstance<ResolvedDependencyResult>()
                .filter { !it.isConstraint }
                .map { it.selected }
            queue.addAll(children)
            val id = component.id as? ModuleComponentIdentifier ?: continue
            components[key(id)] = mapOf(
                "group" to id.group,
                "name" to id.module,
                "version" to id.version,
                "files" to files[key(id)].orEmpty().sorted(),
                "dependencies" to children
                    .mapNotNull { it.id as? ModuleComponentIdentifier }
                    .map(::key)
                    .distinct()
                    .sorted(),
            )
        }

        val document = mapOf(
            "version" to versionName.orNull,
            "components" to components.values.toList(),
        )
        outputFile.get().asFile.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(document)))
    }

    private fun key(id: ModuleComponentIdentifier) = "${id.group}:${id.module}:${id.version}"
}
