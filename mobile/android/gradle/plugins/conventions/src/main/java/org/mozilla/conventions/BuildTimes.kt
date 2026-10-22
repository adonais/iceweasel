/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions

import groovy.json.JsonOutput
import org.gradle.api.flow.FlowAction
import org.gradle.api.flow.FlowParameters
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.services.ServiceReference
import org.gradle.api.tasks.Input
import java.io.File

internal object BuildTimes {
    private val buckets = listOf(
        "kotlin" to Regex("""^compile\w*Kotlin$"""),
        "ksp" to Regex("""^ksp\w*Kotlin$"""),
        "java" to Regex("""^compile\w*JavaWithJavac$"""),
        "r8" to Regex("""^minify\w*WithR8$"""),
        "dex" to Regex("""^(dexBuilder|merge\w*Dex)\w*$"""),
        "lint" to Regex("""^lint"""),
        "test" to Regex("""^(test|connected)\w*Test$"""),
        "mach" to Regex("""^mach"""),
        "resources" to Regex("""Resources|ResValues|Res$|Assets|Manifest"""),
        "codegen" to Regex("""^(generate|glean|nimbus)"""),
        "packaging" to Regex("""^(package|assemble|bundle|sign|zipalign|strip)|NativeLibs|JniLib"""),
    )

    fun bucketFor(taskPath: String): String {
        val name = taskPath.substringAfterLast(':')
        return buckets.firstOrNull { (_, regex) -> regex.containsMatchIn(name) }?.first ?: "other"
    }

    fun perfherderData(summary: BuildSummary, extraOptions: List<String>): Map<String, Any> {
        val phases = linkedMapOf<String, Long>()
        summary.startupDurationMs?.let { phases["startup"] = it }
        summary.configDurationMs?.let { phases["configuration"] = it }
        phases["execution"] = summary.executionDurationMs

        val byBucket = summary.tasks.groupBy { bucketFor(it.path) }
        val appTasks = summary.tasks.filter { it.path.substringBeforeLast(':') == ":app" }
        val work = linkedMapOf<String, Long>()
        work["app kotlin"] = appTasks.filter { bucketFor(it.path) == "kotlin" }.sumOf { it.durationMs }
        work["app ksp"] = appTasks.filter { bucketFor(it.path) == "ksp" }.sumOf { it.durationMs }
        for (bucket in buckets.map { it.first } + "other") {
            work["$bucket task time"] = byBucket[bucket].orEmpty().sumOf { it.durationMs }
        }
        work["app task time"] = summary.tasks.filter { it.path.startsWith(":app:") }.sumOf { it.durationMs }
        work["components task time"] = summary.tasks.filter { it.path.startsWith(":components:") }.sumOf { it.durationMs }

        val subtests = phases + work.filterValues { it > 0 }
        return mapOf(
            "framework" to mapOf("name" to "build_metrics"),
            "suites" to listOf(
                mapOf(
                    "name" to "gradle build times",
                    "value" to seconds(summary.invocationDurationMs),
                    "unit" to "s",
                    "lowerIsBetter" to true,
                    "shouldAlert" to false,
                    "extraOptions" to extraOptions,
                    "subtests" to subtests.map { (name, durationMs) ->
                        mapOf("name" to name, "value" to seconds(durationMs))
                    },
                )
            ),
        )
    }

    private fun seconds(ms: Long): Double = ms / 1_000.0
}

abstract class ReportBuildTimes : FlowAction<ReportBuildTimes.Parameters> {
    interface Parameters : FlowParameters {
        @get:ServiceReference
        val service: Property<BuildMetricsService>

        @get:Input
        val failed: Property<Boolean>

        @get:Input
        val extraOptions: ListProperty<String>

        @get:Input
        val outputDir: Property<String>
    }

    override fun execute(parameters: Parameters) {
        if (parameters.failed.get()) {
            return
        }
        val data = BuildTimes.perfherderData(parameters.service.get().summary, parameters.extraOptions.get())
        val outputDir = File(parameters.outputDir.get()).apply { mkdirs() }
        File(outputDir, "perfherder-data-build-times.json").writeText(JsonOutput.toJson(data))
    }
}
