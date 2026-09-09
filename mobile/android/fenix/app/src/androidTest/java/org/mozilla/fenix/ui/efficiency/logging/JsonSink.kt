/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import android.util.Log
import java.io.File
import java.util.Date
import org.json.JSONObject

/**
 * The machine-readable half of the record: one JSON object per event.
 *
 * Emitted twice, to two transports with different reach:
 *
 * - **A file**, for local use. Rich and complete, but it cannot be collected from CI: the artifacts live in app-scoped
 *   storage and the orchestrator runs `pm clear` between tests, so anything written here is gone before Firebase pulls
 *   anything.
 * - **Logcat**, under its own tag, which is the transport that already survives all of that and is already captured on
 *   every run. effpretty demuxes the tag into a sidecar so the rendered report stays human, and efftriage reads that
 *   sidecar instead of regexing English.
 *
 * That indirection exists because triage over prose breaks silently: a reworded message leaves every test passing and
 * the rules quietly matching nothing.
 */
class JsonSink(private val file: File?) {

    /**
     * Serializes [map], injects `ts`, and appends a line to both transports.
     *
     * Exceptions are caught and logged: logging must never interrupt a test.
     */
    @Synchronized
    fun event(map: Map<String, Any?>) {
        val line =
            try {
                JSONObject(map.filterValues { it != null } + mapOf("ts" to Date().time)).toString()
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to serialize event: ${t.message}")
                return
            }

        // Logcat drops a message over roughly 4k, and a stack trace is the field that gets there.
        // Better a truncated record than a silently missing one.
        try {
            Log.i(TAG, if (line.length <= MAX_LINE) line else truncated(map, line.length))
        } catch (_: Throwable) {
            // Rare logcat failures (buffer full) are not worth failing a test over.
        }

        try {
            file?.appendText(line + "\n")
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to write JSON event: ${t.message}")
        }
    }

    /** Re-serialize without the one field that can be arbitrarily large, noting that it was dropped. */
    private fun truncated(map: Map<String, Any?>, was: Int): String =
        JSONObject(
                map.filterValues { it != null } - "cause" +
                    mapOf(
                        "ts" to Date().time,
                        "causeTruncated" to true,
                        "originalLength" to was,
                        "cause" to (map["cause"] as? String)?.take(CAUSE_BUDGET),
                    )
            )
            .toString()

    private companion object {
        /** Dedicated tag so the structured stream can be separated from the human one. */
        const val TAG = "EffJson"
        const val MAX_LINE = 3_500
        const val CAUSE_BUDGET = 1_200
    }
}
