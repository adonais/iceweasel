/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails

import android.content.Context
import android.os.SystemClock
import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.facts.BrowserThumbnailsFacts
import mozilla.components.browser.thumbnails.facts.emitBrowserThumbnailsFact
import mozilla.components.concept.engine.EngineView
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.ktx.android.content.isOSOnLowMemory
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged

/**
 * Feature implementation for automatically taking thumbnails of sites. The feature will take a screenshot when the page
 * finishes loading, and will add it to the [ContentState.thumbnail] property.
 *
 * If the OS is under low memory conditions, the screenshot will be not taken. Ideally, this should be used in
 * conjunction with `SessionManager.onLowMemory` to allow free up some [ContentState.thumbnail] from memory.
 */
class BrowserThumbnails(
    private val context: Context,
    private val engineView: EngineView,
    private val store: BrowserStore,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Main,
) : LifecycleAwareFeature {

    private var scope: CoroutineScope? = null

    /** Starts observing the selected session to listen for when a session finishes loading. */
    override fun start() {
        scope =
            store.flowScoped(dispatcher = dispatcher) { flow ->
                flow
                    .map { it.selectedTab }
                    .ifAnyChanged { arrayOf(it?.content?.loading, it?.content?.firstContentfulPaint) }
                    .collect { state ->
                        if (state?.content?.loading == false && state.content.firstContentfulPaint) {
                            requestScreenshot(BrowserThumbnailsFacts.CaptureAttemptedTriggers.LOAD_COMPLETED)
                        }
                    }
            }
    }

    /**
     * Requests a screenshot to be taken that can be observed from [BrowserStore] if successful. The request can fail if
     * the device is low on memory or if there is no tab attached to the [EngineView].
     *
     * @param trigger identifies why the capture was requested. Emitted as the `Fact.value` on the
     *   `browser_thumbnails.capture_attempted` labeled counter. Callers must pass one of the
     *   [BrowserThumbnailsFacts.CaptureAttemptedTriggers] constants.
     */
    fun requestScreenshot(trigger: String) {
        emitBrowserThumbnailsFact(
            action = Action.IMPLEMENTATION_DETAIL,
            item = BrowserThumbnailsFacts.Items.CAPTURE_ATTEMPTED,
            value = trigger,
        )
        if (isLowOnMemory()) {
            emitCaptureResult(BrowserThumbnailsFacts.CaptureResults.LOW_MEMORY)
            return
        }
        // Create a local reference to prevent capturing "this" in the lambda
        // which would leak the context if the view is destroyed before the
        // callback is invoked. This is a workaround for:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1678364
        val store = this.store
        val startedAt = SystemClock.elapsedRealtime()
        engineView.captureThumbnail { bitmap ->
            emitCaptureDuration(SystemClock.elapsedRealtime() - startedAt)
            if (bitmap == null) {
                emitCaptureResult(BrowserThumbnailsFacts.CaptureResults.NULL_BITMAP)
                return@captureThumbnail
            }
            val tabId = store.state.selectedTabId ?: return@captureThumbnail
            emitCaptureResult(BrowserThumbnailsFacts.CaptureResults.SUCCEEDED)
            store.dispatch(ContentAction.UpdateThumbnailAction(tabId, bitmap))
        }
    }

    private fun emitCaptureResult(result: String) {
        emitBrowserThumbnailsFact(
            action = Action.IMPLEMENTATION_DETAIL,
            item = BrowserThumbnailsFacts.Items.CAPTURE_RESULT,
            value = result,
        )
    }

    private fun emitCaptureDuration(durationMs: Long) {
        emitBrowserThumbnailsFact(
            action = Action.IMPLEMENTATION_DETAIL,
            item = BrowserThumbnailsFacts.Items.CAPTURE_DURATION,
            metadata = mapOf(BrowserThumbnailsFacts.MetadataKeys.DURATION_MS to durationMs),
        )
    }

    /** Stops observing the selected session. */
    override fun stop() {
        scope?.cancel()
    }

    @VisibleForTesting internal var testLowMemory = false

    private fun isLowOnMemory() = testLowMemory || context.isOSOnLowMemory()
}
