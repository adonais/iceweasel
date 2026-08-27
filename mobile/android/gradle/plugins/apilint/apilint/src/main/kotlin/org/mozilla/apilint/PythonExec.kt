/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.provider.Property
import org.gradle.api.provider.ProviderFactory
import org.gradle.api.tasks.CacheableTask
import org.gradle.api.tasks.Exec
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Internal
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import javax.inject.Inject

/**
 * Executes a Python script embedded in the resources.
 *
 * `Exec` disables caching by default because it cannot know what an arbitrary command reads or
 * writes. The tasks built on this one declare their inputs and outputs, and the script itself is
 * covered by the task's implementation classpath, so the results are safe to cache.
 */
@CacheableTask
abstract class PythonExec : Exec() {
    /** Path to the script to execute. */
    @get:Input
    abstract val scriptPath: Property<String>

    /**
     * Path to the python command used to execute the script. Kept out of the cache key because it is
     * an absolute path into the build environment, which differs per checkout and would stop entries
     * being shared.
     */
    @get:Internal
    abstract val pythonCommand: Property<String>

    @get:Inject
    protected abstract val providerFactory: ProviderFactory

    init {
        // `mach gradle` passes the interpreter it is running under, which is the one to prefer: a
        // bare `python3` is not necessarily on PATH, notably on Windows.
        pythonCommand.convention(
            providerFactory.environmentVariable(MACH_PYTHON_ENV_VAR).orElse("python3"),
        )
    }

    override fun exec() {
        val capturedArgs = args
        val tempFile = copyResourceToTemp(scriptPath.get())

        try {
            val pythonCmd = pythonCommand.get()
            commandLine = listOf(pythonCmd, tempFile.absolutePath) + capturedArgs
            super.exec()
        } finally {
            tempFile.delete()
        }
    }

    private fun copyResourceToTemp(resource: String, prefix: String = "script-", suffix: String = ".py"): File {
        val stream = javaClass.classLoader.getResourceAsStream(resource)
            ?: throw RuntimeException("Java resource not found: $resource")

        var tempFile: File? = null
        return try {
            tempFile = File.createTempFile(prefix, suffix)
            stream.use {
                Files.copy(it, tempFile!!.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            tempFile!!
        } catch (ex: IOException) {
            tempFile?.delete()
            throw RuntimeException(ex)
        }
    }

    companion object {
        /** Set by `mach gradle` to the interpreter mach itself is running under. */
        const val MACH_PYTHON_ENV_VAR = "GRADLE_MACH_PYTHON"
    }
}
