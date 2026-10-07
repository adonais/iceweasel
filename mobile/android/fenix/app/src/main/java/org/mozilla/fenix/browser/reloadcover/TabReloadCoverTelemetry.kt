/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import android.os.SystemClock
import org.mozilla.fenix.GleanMetrics.TabReloadCover

/**
 * Caller-facing exit reasons for [TabReloadCoverTelemetry.onExit]. Each maps to one of the finer-grained `hide_reason`
 * metric labels; the FCP-aware split (`fcp` vs `safety_timeout`, `user_dismissed` vs `user_dismissed_after_fcp`) lives
 * inside the telemetry class so callers don't have to track it.
 */
enum class HideReason {
    /** The cover reached its natural end (post-FCP hold expired, or the pre-FCP safety timeout fired). */
    FINALIZED,

    /** The feature was stopped while the cover was up (fragment lifecycle tore down). */
    STOPPED,

    /** The user tapped the cover, dismissing it early. */
    DISMISSED,

    /** The cover would have been revealed but the device was offline; the paint is likely an error page. */
    OFFLINE,
}

/**
 * Sink for the tab-reload-cover metrics. Kept as an interface so tests can substitute a fake and assert against
 * captured calls without touching Glean's global state.
 */
interface TabReloadCoverRecorder {
    /** Records that a cover was shown. */
    fun recordShown()

    /**
     * Records that a cover was torn down.
     *
     * @param hideReason One of the `HIDE_REASON_*` values on [TabReloadCoverTelemetry.Companion].
     * @param visibleDurationMs Wall-clock milliseconds the cover was visible before the exit.
     */
    fun recordExited(hideReason: String, visibleDurationMs: Int)
}

/** Default [TabReloadCoverRecorder] that dispatches to the generated Glean metrics. */
class GleanTabReloadCoverRecorder : TabReloadCoverRecorder {
    override fun recordShown() {
        TabReloadCover.shown.add()
    }

    override fun recordExited(hideReason: String, visibleDurationMs: Int) {
        TabReloadCover.exited.record(
            TabReloadCover.ExitedExtra(
                hideReason = hideReason,
                visibleDurationMs = visibleDurationMs,
            )
        )
    }
}

/**
 * Encapsulates the tab-reload-cover metrics and the small state machine that decides which `hide_reason` label to emit
 * when the cover is torn down. One instance per [TabReloadCoverFeature] — the state is per-cover-lifetime, not
 * per-process.
 *
 * Contract for callers:
 * - Call [onShown] exactly once per cover appearance, right after the cover ImageView becomes visible.
 * - Call [onFcp] at most once per cover, when FCP fires against the covered tab.
 * - Call [onExit] exactly once with the appropriate [HideReason] to record the exit.
 *
 * [onExit] called before [onShown] is a no-op — nothing was ever visible to the user, so we don't manufacture a
 * hide_reason count that wouldn't match a `shown` count.
 */
class TabReloadCoverTelemetry(private val recorder: TabReloadCoverRecorder = GleanTabReloadCoverRecorder()) {

    // We track elapsed time ourselves rather than using Glean's built-in timer because the exit label (which
    // becomes the event's `hide_reason` extra) isn't known until the exit path runs, so we can only compute
    // the duration at [onExit] time.
    private var showStartElapsedMs: Long = NOT_SHOWING
    private var sawFcp: Boolean = false

    /** Records `shown` and stamps the start of the visible-duration measurement. */
    fun onShown() {
        recorder.recordShown()
        showStartElapsedMs = SystemClock.elapsedRealtime()
        sawFcp = false
    }

    /** Marks that FCP fired against the covered tab — refines which `hide_reason` [onExit] emits. */
    fun onFcp() {
        sawFcp = true
    }

    /**
     * Emits the `tab_reload_cover.exited` event with the appropriate `hide_reason` for [reason] and the current FCP
     * state, and stamps the wall-clock duration on the event.
     */
    fun onExit(reason: HideReason) {
        if (showStartElapsedMs == NOT_SHOWING) return
        val elapsedMs = SystemClock.elapsedRealtime() - showStartElapsedMs
        val hideReason =
            when (reason) {
                HideReason.FINALIZED -> if (sawFcp) HIDE_REASON_FCP else HIDE_REASON_SAFETY_TIMEOUT
                HideReason.STOPPED -> HIDE_REASON_STOPPED
                HideReason.DISMISSED -> if (sawFcp) HIDE_REASON_USER_DISMISSED_AFTER_FCP else HIDE_REASON_USER_DISMISSED
                HideReason.OFFLINE -> HIDE_REASON_OFFLINE
            }
        recorder.recordExited(hideReason, elapsedMs.toInt())
        showStartElapsedMs = NOT_SHOWING
        sawFcp = false
    }

    companion object {
        private const val NOT_SHOWING = -1L

        // Enumeration of the `hide_reason` extra values on the tab_reload_cover.exited event. Kept in sync
        // with the extra_keys.hide_reason description in metrics.yaml.
        const val HIDE_REASON_FCP = "fcp"
        const val HIDE_REASON_SAFETY_TIMEOUT = "safety_timeout"
        const val HIDE_REASON_STOPPED = "stopped"
        const val HIDE_REASON_USER_DISMISSED = "user_dismissed"
        const val HIDE_REASON_USER_DISMISSED_AFTER_FCP = "user_dismissed_after_fcp"
        const val HIDE_REASON_OFFLINE = "offline"
    }
}
