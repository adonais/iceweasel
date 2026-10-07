/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import android.widget.ImageView
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import mozilla.components.browser.state.selector.findTabOrCustomTabOrSelectedTab
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.storage.ThumbnailStorage
import mozilla.components.concept.base.images.ImageLoadRequest
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged
import org.mozilla.fenix.browser.store.BrowserScreenAction.TabReloadCoverVisibilityUpdated
import org.mozilla.fenix.browser.store.BrowserScreenStore

// Safety timers for the cover's lifecycle. A typical restore reveal walks the timeline:
//
//   t0                              firstSighting → LoadAndShow + StartTimer(PRE_FCP)
//   t0 + ~20ms   engineSession linked  → StartTimer(POST_RESTORE_LINK [_STALE_FCP])
//   t0 + ~200ms  fresh FCP fires       → StartTimer(POST_FCP_HOLD)
//   t0 + ~600ms  timer fires           → hideAndReset()
//
// The pre-link timer is the outer safety net while GeckoView links a fresh engine session onto the
// restored SessionState. Once linked, the paint either fires promptly or (for bfcache renders)
// never fires at all, so we shorten to 2s. When the fcp flag captured at first-sighting is stale
// (see initialFcpStale below), no fresh FCP transition is coming, so we shorten further to 1s. On
// a genuine fresh FCP we hold 400ms behind the cover — enough to swallow late reflows (fonts
// finishing shaping, late images filling in) before the cover fades away.
private const val COVER_PRE_FCP_TIMEOUT_MS = 5_000L
private const val COVER_POST_RESTORE_LINK_MS = 2_000L
private const val COVER_POST_RESTORE_LINK_STALE_FCP_MS = 1_000L
private const val COVER_POST_FCP_HOLD_MS = 400L

/**
 * Shows a stored thumbnail as a cover over [EngineView] while a tab is being restored, hiding it once the first
 * contentful paint fires. Falls back gracefully when no thumbnail is available.
 *
 * ## When it activates
 *
 * Only for a tab that is *restore-pending*: `engineState.engineSession == null` and `engineState.engineSessionState !=
 * null`. In Fenix terms, this is a tab whose serialized state has been recreated (parent-process restart) or whose
 * engine session was killed (content-process crash) and is waiting for GeckoView to attach a fresh engine session.
 * Fresh navigations on an already-alive tab (`engineSession != null`) never paint blank, so they skip the cover
 * entirely.
 *
 * ## Observed signals
 *
 * The [start] flow reacts to only three per-tab signals: tab id, `firstContentfulPaint`, and `engineSession != null`.
 * Everything else (URL updates, loading state, progress) is churn we deliberately ignore.
 *
 * ## Side-channel visibility
 *
 * Cover visibility is mirrored into [browserScreenStore] via [TabReloadCoverVisibilityUpdated] so the toolbar can
 * render a "Cached" URL prefix while the cover is up. That store-flag also gates the "Live page" toast: the toast fires
 * only on the natural timer-driven finalize (when a cover that actually reached the user gives way to the live page),
 * never on user-driven dismissal or on covers whose bitmap load never completed.
 *
 * ## Telemetry
 *
 * All Glean recording is routed through [telemetry] rather than accessed directly here. Three events cover the cover's
 * lifecycle: `onShown` at the moment the presenter is asked to display the bitmap, `onFcp` on a fresh post-cover paint,
 * and `onExit(reason)` on every teardown path (natural finalize, user dismissal, feature stop, offline). Keeping the
 * recording behind a facade lets tests inject a Recorder fake without perturbing Glean's global state.
 *
 * ## Offline behavior
 *
 * When [isOnline] returns false we skip the reveal entirely — whatever loads underneath is almost certainly an error
 * page, so a cached preview would promise a reveal we can't deliver. We check at two places: at first sighting (never
 * begin covering when offline) and at fresh-FCP-while-covering (bail immediately rather than holding). Known caveat
 * inherited from [mozilla.components.browser.thumbnails.BrowserThumbnails]: its auto-capture on load-complete runs
 * regardless of connectivity, so an offline error-page render can overwrite the on-disk thumbnail and briefly appear as
 * the cover on the next restore. Fix (gating BrowserThumbnails' captures on connectivity) is deferred.
 *
 * ## Threading
 *
 * All mutation runs on [dispatcher] (Main in production, injected for tests). The store observation and both
 * [scope]-launched jobs share that dispatcher, so the mutable tracking fields don't need synchronization.
 */
class TabReloadCoverFeature(
    private val store: BrowserStore,
    private val browserScreenStore: BrowserScreenStore,
    private val thumbnailStorage: ThumbnailStorage,
    coverView: ImageView,
    private val tabId: String? = null,
    private val isOnline: () -> Boolean,
    private val telemetry: TabReloadCoverTelemetry = TabReloadCoverTelemetry(),
    private val dispatcher: CoroutineDispatcher = Dispatchers.Main,
) : LifecycleAwareFeature {

    // The presenter owns the ImageView; we hand it a callback so touches on the cover route back here as
    // [onDismissed]. See [ImageViewCoverPresenter.show] for why the presenter also tears the view down locally.
    private val presenter: CoverPresenter =
        ImageViewCoverPresenter(coverView).apply { onDismissedByTouch { onDismissed() } }

    private var scope: CoroutineScope? = null
    private var thumbnailJob: Job? = null
    private var timerJob: Job? = null

    // Per-tab tracking. All fields reset together via [resetTracking] on every teardown path.
    //
    // - trackedTabId: the tab we're currently observing. Set on first sighting of a new id; used to short-circuit the
    //   show decision on subsequent updates for the same tab and to detect tab-switches.
    // - initialFcpStale: true when `firstContentfulPaint` was already set the moment we first saw the tab. That flag
    //   is a Fenix ContentState field that survives a content-process crash even though the tab is visually blank
    //   waiting to be re-rendered. Without this guard we would see `fcp=true` on the first update after such a
    //   restore and skip the cover (treating a stale value as a fresh paint).
    // - engineLinkedForTab: true after we've observed `engineSession != null` for this tab. Latches so the pre-link →
    //   post-link timer shortening fires exactly once per cover attempt.
    // - covering: true once we've committed to showing a cover for this tab (i.e. dispatched a bitmap load). Distinct
    //   from "the presenter's ImageView is actually visible" — the bitmap load is async and may not have completed.
    //   All the "we're mid-cover, react accordingly" branches gate on this.
    private var trackedTabId: String? = null
    private var initialFcpStale = false
    private var engineLinkedForTab = false
    private var covering = false

    override fun start() {
        scope =
            CoroutineScope(dispatcher + SupervisorJob()).also { s ->
                store.stateFlow
                    .map { state -> state.findTabOrCustomTabOrSelectedTab(tabId) }
                    .ifAnyChanged { tab ->
                        arrayOf(
                            tab?.id,
                            tab?.content?.firstContentfulPaint,
                            tab?.engineState?.engineSession != null,
                        )
                    }
                    .onEach { tab -> onUpdate(tab) }
                    .launchIn(s)
            }
    }

    override fun stop() {
        // Feature is being torn down (fragment destroyed / app backgrounded past its lifecycle). Record the exit
        // regardless of `covering`; the recorder itself gates on whether a cover was actually shown.
        telemetry.onExit(HideReason.STOPPED)
        thumbnailJob?.cancel()
        timerJob?.cancel()
        scope?.cancel()
        presenter.detach()
        resetTracking()
    }

    private fun onUpdate(tab: SessionState?) {
        // Null or private → immediate teardown. Private tabs are excluded from the cover feature entirely; their
        // thumbnails live in a separate storage bucket and their presence would leak private-browsing UX to the
        // rest of the toolbar surface.
        if (tab == null || tab.content.private) {
            tearDown()
            return
        }
        // Tab id changed — we've switched tabs (or the selected tab was replaced). Tear down any in-flight cover
        // for the previous tab, then evaluate the new one from scratch.
        if (tab.id != trackedTabId) {
            tearDown()
            firstSighting(tab)
            return
        }

        // Same tab, later update. Two interesting transitions to react to: a fresh FCP, or the engine session just
        // linked (still waiting for paint). Anything else is spurious churn from other observed signals changing.

        // Once we observe fcp=false, subsequent fcp=true is a genuine fresh paint rather than a value inherited at
        // first-sighting from a prior process's paint (which can happen after a content-process crash).
        if (!tab.content.firstContentfulPaint) initialFcpStale = false

        if (tab.content.firstContentfulPaint && !initialFcpStale && covering) {
            if (!isOnline()) {
                // Offline at reveal time: whatever painted is almost certainly Gecko's error page rather than
                // the live site. Hide immediately — no post-FCP hold (nothing worth smoothing over) and no
                // toast (the "Live page" promise would be a lie).
                telemetry.onExit(HideReason.OFFLINE)
                hideAndReset(withToast = false)
            } else {
                // Fresh FCP fired while covering: hold briefly to smooth late reflows behind the cover before
                // revealing. Record onFcp here rather than on exit — this is the FCP-during-cover signal, not
                // the exit reason.
                telemetry.onFcp()
                startTimer(COVER_POST_FCP_HOLD_MS)
            }
            return
        }

        if (covering && !engineLinkedForTab && tab.engineState.engineSession != null) {
            // Engine session just linked (null → non-null). Shorten the safety timer. If the fcp flag is stale we
            // shorten further because we know a fresh paint transition isn't coming; the goal is only to let the
            // engine paint the restored content over the cover, then bail.
            engineLinkedForTab = true
            startTimer(if (initialFcpStale) COVER_POST_RESTORE_LINK_STALE_FCP_MS else COVER_POST_RESTORE_LINK_MS)
        }
    }

    private fun firstSighting(tab: SessionState) {
        trackedTabId = tab.id
        // Capture the initial fcp value — see [initialFcpStale] field comment for why this matters.
        initialFcpStale = tab.content.firstContentfulPaint
        engineLinkedForTab = tab.engineState.engineSession != null

        // A tab is "restore pending" when Fenix has serialized engine state (from disk or memory) but hasn't yet
        // attached a fresh engine session to it. Fresh navigation on an already-alive tab has engineSession != null
        // and never blanks the view, so it wouldn't benefit from a cover.
        val restorePending = tab.engineState.engineSession == null && tab.engineState.engineSessionState != null
        // Skip when offline: whatever loads is almost certainly an error page, so a cached preview
        // would promise a reveal we can't deliver.
        if (restorePending && isOnline()) {
            covering = true
            startLoadAndShow(tab.id)
            startTimer(COVER_PRE_FCP_TIMEOUT_MS)
        }
    }

    private fun startLoadAndShow(coverTabId: String) {
        thumbnailJob?.cancel()
        thumbnailJob = scope?.launch {
            val bitmap =
                thumbnailStorage
                    .loadThumbnail(
                        ImageLoadRequest(
                            id = coverTabId,
                            size = presenter.preferredThumbnailWidth(),
                            // Restore-pending non-private tabs only reach this path.
                            isPrivate = false,
                        )
                    )
                    .await() ?: return@launch
            // Between launch and .await() the world may have moved on — a tab switch, or a timer fired and reset
            // tracking. Bail if the tracked tab no longer matches; without this guard we'd present a stale bitmap
            // over a different tab's content.
            if (trackedTabId != coverTabId || !covering) return@launch
            presenter.show(bitmap)
            // Record onShown here — after the stale-check guard, so a stale load that never reaches the user isn't
            // counted as a shown cover.
            telemetry.onShown()
            // Announce cover-up to the browser screen store. Consumers: the toolbar reads this to swap the URL for
            // a "Cached" chip, and the timer-driven finalize below gates its toast on the same flag.
            browserScreenStore.dispatch(TabReloadCoverVisibilityUpdated(isVisible = true))
        }
    }

    private fun startTimer(delayMs: Long) {
        // Each call replaces the previous timer. The lifecycle can schedule several back-to-back (pre-link, then
        // post-link on engine linked, then post-FCP on paint); only the latest matters.
        timerJob?.cancel()
        timerJob = scope?.launch {
            delay(delayMs.milliseconds)
            onTimerFired()
        }
    }

    private fun onTimerFired() {
        // The timer can outlive its purpose — e.g. the user dismissed the cover after we scheduled the timer
        // but before it fired. Guard on `covering`; if we've already reset, do nothing.
        if (!covering) return
        // Timer-driven finalize is the only path that reveals a live page over a cover that actually reached the
        // user; that's the moment a "Live page" toast is meaningful. Gate the toast on the store's visibility flag
        // rather than `covering`: `covering=true` includes the window where the bitmap load hasn't landed yet,
        // and a toast for a cover the user never saw would be a spurious surprise.
        val wasVisible = browserScreenStore.state.isShowingTabReloadCover
        telemetry.onExit(HideReason.FINALIZED)
        hideAndReset(withToast = wasVisible)
    }

    private fun onDismissed() {
        // Fires when the user taps the cover. The presenter has already torn the view down locally (see
        // [ImageViewCoverPresenter.show] for why); our job here is to reset the tracking flags and mirror the
        // hide into the store. Never surface the "Live page" toast on a user-dismiss — the user just told us
        // they've seen enough.
        telemetry.onExit(HideReason.DISMISSED)
        hideAndReset(withToast = false)
    }

    private fun tearDown() {
        // Split on `covering` so we don't fire a hide animation for a tab we never covered. If we latched a
        // fresh-nav / already-linked tab (`covering=false`), we just reset the flags. Teardown is also never a
        // toast-worthy transition — it fires on tab switch, private-tab activation, or stop().
        if (covering) hideAndReset(withToast = false) else resetTracking()
    }

    private fun hideAndReset(withToast: Boolean) {
        thumbnailJob?.cancel()
        timerJob?.cancel()
        presenter.hideWithFade()
        if (withToast) presenter.showLivePageToast()
        browserScreenStore.dispatch(TabReloadCoverVisibilityUpdated(isVisible = false))
        resetTracking()
    }

    private fun resetTracking() {
        trackedTabId = null
        initialFcpStale = false
        engineLinkedForTab = false
        covering = false
    }
}
