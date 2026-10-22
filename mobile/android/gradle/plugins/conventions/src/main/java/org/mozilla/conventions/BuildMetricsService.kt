/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions

import groovy.json.JsonBuilder
import org.gradle.api.provider.Property
import org.gradle.api.services.BuildService
import org.gradle.api.services.BuildServiceParameters
import org.gradle.tooling.events.FinishEvent
import org.gradle.tooling.events.OperationCompletionListener
import org.gradle.tooling.events.task.TaskFailureResult
import org.gradle.tooling.events.task.TaskFinishEvent
import org.gradle.tooling.events.task.TaskSkippedResult
import org.gradle.tooling.events.task.TaskSuccessResult
import java.io.File
import java.lang.management.ManagementFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Collections
import java.util.Locale
import javax.inject.Inject

interface BuildMetricsServiceParameters : BuildServiceParameters {
    val outputDir: Property<String>
    val fileSuffix: Property<String>
    val buildId: Property<String>
    val configStartMs: Property<Long>
}

internal data class TaskRecord(val path: String, val startMs: Long, val endMs: Long, val status: String) {
    val durationMs: Long get() = endMs - startMs
}

internal object ConfiguredBuilds {
    data class ConfiguredBuild(val configEndMs: Long?)

    private val builds = mutableMapOf<String, Long?>()

    @Synchronized
    fun recordConfigStart(buildId: String) {
        builds.putIfAbsent(buildId, null)
    }

    @Synchronized
    fun recordConfigEnd(buildId: String, configEndMs: Long) {
        builds[buildId] = configEndMs
    }

    @Synchronized
    fun consume(buildId: String): ConfiguredBuild? =
        if (buildId in builds) ConfiguredBuild(builds.remove(buildId)) else null
}

internal data class BuildSummary(
    val invocationStartMs: Long,
    val invocationEndMs: Long,
    val configStartMs: Long?,
    val executionStartMs: Long,
    val executionEndMs: Long,
    val tasks: List<TaskRecord>,
) {
    val configured: Boolean get() = configStartMs != null
    val invocationDurationMs: Long get() = invocationEndMs - invocationStartMs
    val startupDurationMs: Long? get() = configStartMs?.let { it - invocationStartMs }
    val configDurationMs: Long? get() = configStartMs?.let { executionStartMs - it }
    val executionDurationMs: Long get() = executionEndMs - executionStartMs
}

abstract class BuildMetricsService @Inject constructor(
    private val parameters: BuildMetricsServiceParameters
) : BuildService<BuildMetricsServiceParameters>, OperationCompletionListener, AutoCloseable {
    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd-HH-mm-ss-SSS")
    private val taskRecords = Collections.synchronizedList(mutableListOf<TaskRecord>())

    internal val summary: BuildSummary by lazy { summarize() }

    override fun onFinish(event: FinishEvent) {
        if (event is TaskFinishEvent) {
            val result = event.result

            val status = when (result) {
                is TaskFailureResult -> "FAILED"
                is TaskSkippedResult -> "SKIPPED"
                is TaskSuccessResult -> when {
                    result.isUpToDate -> "UP-TO-DATE"
                    result.isFromCache -> "FROM-CACHE"
                    else -> "EXECUTED"
                }
                else -> "UNKNOWN"
            }

            taskRecords += TaskRecord(event.descriptor.taskPath, result.startTime, result.endTime, status)
        }
    }

    override fun close() {
        val content = linkedMapOf<String, Any?>()
        content["invocation"] = timing(summary.invocationStartMs, summary.invocationEndMs) +
            mapOf("startMeasuredFrom" to "jvmStart")
        summary.configStartMs?.let { content["configPhase"] = timing(it, summary.executionStartMs) }
        content["executionPhase"] = timing(summary.executionStartMs, summary.executionEndMs)
        content["configurationCacheReused"] = !summary.configured
        content["tasks"] = summary.tasks.map { task ->
            mapOf("path" to task.path) + timing(task.startMs, task.endMs) + mapOf("status" to task.status)
        }

        val outputDir = File(parameters.outputDir.get()).apply { mkdirs() }
        val fileSuffix = parameters.fileSuffix.orNull ?: formatTimestamp(summary.invocationEndMs)
        File(outputDir, "build-metrics-$fileSuffix.json").writeText(JsonBuilder(content).toPrettyString())
    }

    private fun summarize(): BuildSummary {
        val invocationEndMs = System.currentTimeMillis()
        val tasks = synchronized(taskRecords) { taskRecords.toList() }.sortedBy { it.startMs }
        val configuredBuild = ConfiguredBuilds.consume(parameters.buildId.get())
        val executionStartMs = configuredBuild?.configEndMs ?: tasks.minOfOrNull { it.startMs } ?: invocationEndMs
        val executionEndMs = maxOf(tasks.maxOfOrNull { it.endMs } ?: invocationEndMs, executionStartMs)
        return BuildSummary(
            invocationStartMs = ManagementFactory.getRuntimeMXBean().startTime,
            invocationEndMs = invocationEndMs,
            configStartMs = if (configuredBuild != null) parameters.configStartMs.get() else null,
            executionStartMs = executionStartMs,
            executionEndMs = executionEndMs,
            tasks = tasks,
        )
    }

    private fun timing(startMs: Long, endMs: Long): Map<String, Any> = mapOf(
        "start" to formatTimestamp(startMs),
        "end" to formatTimestamp(endMs),
        "duration" to String.format(Locale.ROOT, "%.3f", (endMs - startMs) / 1_000.0),
        "startMs" to startMs,
        "endMs" to endMs,
        "durationMs" to endMs - startMs,
    )

    private fun formatTimestamp(ms: Long): String =
        dateFormatter.format(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()))
}
