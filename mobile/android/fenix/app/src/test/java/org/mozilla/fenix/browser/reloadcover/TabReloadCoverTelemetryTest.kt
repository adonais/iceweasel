/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_FCP
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_OFFLINE
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_SAFETY_TIMEOUT
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_STOPPED
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_USER_DISMISSED
import org.mozilla.fenix.browser.reloadcover.TabReloadCoverTelemetry.Companion.HIDE_REASON_USER_DISMISSED_AFTER_FCP

class TabReloadCoverTelemetryTest {

    private class FakeTabReloadCoverRecorder : TabReloadCoverRecorder {
        data class ExitedRecord(val hideReason: String, val visibleDurationMs: Int)

        var shownCount = 0
        val exited = mutableListOf<ExitedRecord>()

        override fun recordShown() {
            shownCount++
        }

        override fun recordExited(hideReason: String, visibleDurationMs: Int) {
            exited += ExitedRecord(hideReason, visibleDurationMs)
        }
    }

    private val recorder = FakeTabReloadCoverRecorder()
    private val telemetry = TabReloadCoverTelemetry(recorder)

    @Test
    fun `WHEN onShown is called THEN the shown counter increments`() {
        telemetry.onShown()

        assertEquals(1, recorder.shownCount)
    }

    @Test
    fun `WHEN onExit(FINALIZED) is called after onShown and onFcp THEN exited event with hide_reason=fcp is recorded`() {
        telemetry.onShown()
        telemetry.onFcp()
        telemetry.onExit(HideReason.FINALIZED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_FCP, recorder.exited.first().hideReason)
        assertTrue(recorder.exited.first().visibleDurationMs >= 0)
    }

    @Test
    fun `WHEN onExit(FINALIZED) is called after onShown without onFcp THEN exited event with hide_reason=safety_timeout is recorded`() {
        telemetry.onShown()
        telemetry.onExit(HideReason.FINALIZED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_SAFETY_TIMEOUT, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN onExit(STOPPED) is called after onShown THEN exited event with hide_reason=stopped is recorded`() {
        telemetry.onShown()
        telemetry.onExit(HideReason.STOPPED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_STOPPED, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN onExit(DISMISSED) is called after onShown without onFcp THEN exited event with hide_reason=user_dismissed is recorded`() {
        telemetry.onShown()
        telemetry.onExit(HideReason.DISMISSED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_USER_DISMISSED, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN onExit(DISMISSED) is called after onShown and onFcp THEN exited event with hide_reason=user_dismissed_after_fcp is recorded`() {
        telemetry.onShown()
        telemetry.onFcp()
        telemetry.onExit(HideReason.DISMISSED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_USER_DISMISSED_AFTER_FCP, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN onExit is called without onShown THEN no event is recorded and shown stays at zero`() {
        telemetry.onExit(HideReason.DISMISSED)

        assertTrue(recorder.exited.isEmpty())
        assertEquals(0, recorder.shownCount)
    }

    @Test
    fun `WHEN onExit(OFFLINE) is called after onShown THEN exited event with hide_reason=offline is recorded`() {
        telemetry.onShown()
        telemetry.onExit(HideReason.OFFLINE)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_OFFLINE, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN onFcp is called before onShown THEN the flag does not leak across cover lifetimes`() {
        // onFcp before onShown should not survive into the next onShown -> onExit(FINALIZED) cycle.
        telemetry.onFcp()
        telemetry.onShown()
        telemetry.onExit(HideReason.FINALIZED)

        assertEquals(1, recorder.exited.size)
        assertEquals(HIDE_REASON_SAFETY_TIMEOUT, recorder.exited.first().hideReason)
    }

    @Test
    fun `WHEN two full show-finalize cycles happen THEN shown counts twice and two events are recorded`() {
        telemetry.onShown()
        telemetry.onFcp()
        telemetry.onExit(HideReason.FINALIZED)

        telemetry.onShown()
        telemetry.onExit(HideReason.FINALIZED)

        assertEquals(2, recorder.shownCount)
        assertEquals(2, recorder.exited.size)
        assertEquals(HIDE_REASON_FCP, recorder.exited[0].hideReason)
        assertEquals(HIDE_REASON_SAFETY_TIMEOUT, recorder.exited[1].hideReason)
    }
}
