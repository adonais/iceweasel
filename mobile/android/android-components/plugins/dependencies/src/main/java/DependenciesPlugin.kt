/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import org.gradle.api.Plugin
import org.gradle.api.flow.FlowAction
import org.gradle.api.flow.FlowParameters
import org.gradle.api.flow.FlowProviders
import org.gradle.api.flow.FlowScope
import org.gradle.api.initialization.Settings
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.kotlin.dsl.always
import java.util.Optional
import javax.inject.Inject

// If you ever need to force a toolchain rebuild (taskcluster) then edit the following comment.
// FORCE REBUILD 2024-05-02

/**
 * Print Gradle errors in such a way that Treeherder includes them in its "Failure Summary".  This
 * approach is technically complicated but is compatible with the Gradle configuration cache.
 *
 * The unusual output is recognized by Treeherder even when Gradle is directly invoked without
 * `mach` or `mozharness` logging.
 */
abstract class LogGradleErrorForTreeHerder : FlowAction<LogGradleErrorForTreeHerder.Parameters> {
    interface Parameters : FlowParameters {
        @get:Input
        val failure: Property<Optional<Throwable>>
    }

    companion object {
        private fun appendIndentedMessage(
            sb: StringBuilder,
            t: Throwable,
            indentStr: String,
        ) {
            val message: String = (t.message ?: "").replace("(?m)^".toRegex(), indentStr)
            if (message.isNotEmpty()) {
                // We don't want the first line indented.
                sb.append(message.substring(indentStr.length))
            }
            sb.append("\n")
            if (t.cause != null && t.cause != t) {
                sb.append(indentStr)
                sb.append("> ")
                appendIndentedMessage(sb, t.cause!!, indentStr + "  ")
            }
        }

        fun getIndentedMessage(t: Throwable): String {
            val sb = StringBuilder()
            appendIndentedMessage(sb, t, "")
            return sb.toString()
        }
    }

    /**
     * Print non-null `Throwable` with each line prefixed by "[gradle:error]: >".  Each `cause` is
     * printed indented, roughly matching Gradle's output.
     *
     * Treeherder recognizes such lines as errors and surfaces them in its "Failure Summary"; see
     * https://github.com/mozilla/treeherder/blob/b04b64185e189a2d9e4c088b4be98d898c658e00/treeherder/log_parser/parsers.py#L75.
     * Treeherder trims leading spaces; the extra ">" preserves indentation.
     */
    override fun execute(parameters: Parameters) {
        parameters.failure.get().map { t ->
            getIndentedMessage(t).split("\n").forEach {
                println("[gradle:error]: > ${it}")
            }
        }
    }
}

abstract class DependenciesPlugin : Plugin<Settings> {
    @get:Inject
    protected abstract val flowScope: FlowScope

    @get:Inject
    protected abstract val flowProviders: FlowProviders

    override fun apply(settings: Settings) {
        flowScope.always(LogGradleErrorForTreeHerder::class) {
            parameters.failure.set(flowProviders.buildWorkResult.map { result -> result.failure })
        }
    }
}

// Synchronized dependencies used by (some) modules
@Suppress("Unused", "MaxLineLength")
object ComponentsDependencies {
    val mozilla_appservices_fxaclient = "${ApplicationServicesConfig.groupId}:fxaclient:${ApplicationServicesConfig.version}"
    val mozilla_appservices_nimbus = "${ApplicationServicesConfig.groupId}:nimbus:${ApplicationServicesConfig.version}"
    val mozilla_appservices_autofill = "${ApplicationServicesConfig.groupId}:autofill:${ApplicationServicesConfig.version}"
    val mozilla_appservices_logins = "${ApplicationServicesConfig.groupId}:logins:${ApplicationServicesConfig.version}"
    val mozilla_appservices_places = "${ApplicationServicesConfig.groupId}:places:${ApplicationServicesConfig.version}"
    val mozilla_appservices_syncmanager = "${ApplicationServicesConfig.groupId}:syncmanager:${ApplicationServicesConfig.version}"
    val mozilla_remote_settings = "${ApplicationServicesConfig.groupId}:remotesettings:${ApplicationServicesConfig.version}"
    val mozilla_appservices_push = "${ApplicationServicesConfig.groupId}:push:${ApplicationServicesConfig.version}"
    val mozilla_appservices_search = "${ApplicationServicesConfig.groupId}:search:${ApplicationServicesConfig.version}"
    val mozilla_appservices_tabs = "${ApplicationServicesConfig.groupId}:tabs:${ApplicationServicesConfig.version}"
    val mozilla_appservices_suggest = "${ApplicationServicesConfig.groupId}:suggest:${ApplicationServicesConfig.version}"
    val mozilla_appservices_httpconfig = "${ApplicationServicesConfig.groupId}:httpconfig:${ApplicationServicesConfig.version}"
    val mozilla_appservices_init_rust_components = "${ApplicationServicesConfig.groupId}:init_rust_components:${ApplicationServicesConfig.version}"
    val mozilla_appservices_full_megazord = "${ApplicationServicesConfig.groupId}:full-megazord:${ApplicationServicesConfig.version}"
    val mozilla_appservices_full_megazord_libsForTests = "${ApplicationServicesConfig.groupId}:full-megazord-libsForTests:${ApplicationServicesConfig.version}"

    val mozilla_appservices_errorsupport = "${ApplicationServicesConfig.groupId}:errorsupport:${ApplicationServicesConfig.version}"
    val mozilla_appservices_rust_log_forwarder = "${ApplicationServicesConfig.groupId}:rust-log-forwarder:${ApplicationServicesConfig.version}"
    val mozilla_appservices_sync15 = "${ApplicationServicesConfig.groupId}:sync15:${ApplicationServicesConfig.version}"
}
