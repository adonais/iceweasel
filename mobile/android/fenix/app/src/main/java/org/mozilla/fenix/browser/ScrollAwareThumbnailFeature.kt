/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.BrowserThumbnails
import mozilla.components.browser.thumbnails.facts.BrowserThumbnailsFacts.CaptureAttemptedTriggers
import mozilla.components.concept.engine.EngineSession
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.feature.LifecycleAwareFeature

/**
 * Refreshes the stored thumbnail of the currently-selected tab when the user has scrolled since the last capture and
 * the tab is about to leave the foreground — either because the user selected a different tab or the hosting lifecycle
 * owner paused (typically app backgrounded).
 *
 * Captures are skipped when no scroll change has happened since the previous capture, so idle app-backgrounding
 * sequences do not trigger redundant work.
 *
 * Known limitations:
 * - **Backgrounded-tab thumbnails are best-effort.** When the user switches away from a tab within a session (tapping
 *   +, opening the tabs tray, etc.), the browser fragment is torn down within ~10 ms of our capture trigger, detaching
 *   the engine view's compositor before Gecko's pixel readback completes. The capture returns a null bitmap and the
 *   tab's on-disk thumbnail stays at whatever [mozilla.components.browser.thumbnails.BrowserThumbnails] auto-captured
 *   at load-complete (typically y=0). Only the currently-foreground tab at app-background time is captured reliably.
 *   Tracked as Bug 2066741 — a session-scoped capture API that doesn't require the shared engine view.
 * - **Session-state persistence can race the capture.** Fenix's SessionStorage AutoSave may not have persisted the most
 *   recent scroll change when the capture fires, so on restore the thumbnail (post-scroll) can disagree with the
 *   restored scroll (pre-scroll) and produce a visible reveal jump. See Bug 2066687, which flushes Gecko's session
 *   state before AutoSaveBackground runs.
 */
class ScrollAwareThumbnailFeature(
    private val store: BrowserStore,
    lifecycleOwner: LifecycleOwner,
    private val thumbnailsFeature: () -> BrowserThumbnails?,
    private val isOnline: () -> Boolean,
) : LifecycleAwareFeature {

    private var scope: CoroutineScope? = null
    private var observedSession: EngineSession? = null
    private var currentScrollX: Int = 0
    private var currentScrollY: Int = 0
    private var lastCapturedScrollX: Int? = null
    private var lastCapturedScrollY: Int? = null

    private val scrollObserver =
        object : EngineSession.Observer {
            override fun onScrollChange(scrollX: Int, scrollY: Int) {
                currentScrollX = scrollX
                currentScrollY = scrollY
            }
        }

    init {
        lifecycleOwner.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onPause(owner: LifecycleOwner) {
                    maybeCaptureThumbnail()
                }
            }
        )
    }

    override fun start() {
        scope =
            store.flowScoped(dispatcher = Dispatchers.Main) { flow ->
                flow
                    .map { it.selectedTab?.engineState?.engineSession }
                    .distinctUntilChanged()
                    .collect { session -> onSelectedSessionChanged(session) }
            }
    }

    override fun stop() {
        detachObserver()
        scope?.cancel()
        scope = null
    }

    private fun onSelectedSessionChanged(newSession: EngineSession?) {
        // Only capture the outgoing tab when we actually had one attached. On the first flow
        // emission (or when the previous emission was null), there is no compositor content to
        // capture — a request would produce a null bitmap and pollute the lastCaptured baseline.
        if (observedSession != null) {
            maybeCaptureThumbnail()
        }
        detachObserver()
        if (newSession != null) {
            attachObserver(newSession)
        }
    }

    private fun attachObserver(session: EngineSession) {
        session.register(scrollObserver)
        observedSession = session
    }

    private fun detachObserver() {
        observedSession?.unregister(scrollObserver)
        observedSession = null
    }

    private fun maybeCaptureThumbnail() {
        if (lastCapturedScrollX == currentScrollX && lastCapturedScrollY == currentScrollY) return
        // Skip capture when offline — the current paint is likely an error page or cached content;
        // snapshotting an error page would replace the good thumbnail and show the error as the
        // "cached preview" on the next restore.
        if (!isOnline()) return
        val feature = thumbnailsFeature() ?: return
        feature.requestScreenshot(CaptureAttemptedTriggers.TAB_BACKGROUNDED)
        lastCapturedScrollX = currentScrollX
        lastCapturedScrollY = currentScrollY
    }
}
