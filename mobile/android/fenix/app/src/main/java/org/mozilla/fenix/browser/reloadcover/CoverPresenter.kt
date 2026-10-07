/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import org.mozilla.fenix.R

private const val COVER_HIDE_ANIMATION_DURATION_MS = 150L

// Short enough to feel instant, long enough to smooth the pop between GONE and a full-alpha bitmap on top of the
// engine view. Below the ~100 ms threshold at which humans perceive motion as delayed, so the reveal still reads
// as immediate.
private const val COVER_FADE_IN_DURATION_MS = 80L

/**
 * View-side of the tab-reload cover. The state machine decides *when* to show/hide; the presenter implements *how*.
 * Kept as an interface so tests can spy on presenter interactions without touching a real [ImageView].
 */
internal interface CoverPresenter {
    /**
     * Shows the cover with [bitmap]. The presenter is responsible for mirroring the engine view's vertical offset so
     * the covered content lines up under the toolbar.
     */
    fun show(bitmap: Bitmap)

    /** Hides the cover with a fade. Called when the paint-driven reveal finalizes. */
    fun hideWithFade()

    /** Tears the cover down immediately without a fade — used when the user's touch dismisses it. */
    fun hideImmediately()

    /** Register a callback fired on ACTION_DOWN while the cover is visible. */
    fun onDismissedByTouch(callback: () -> Unit)

    /** Pixel width the caller should request for the thumbnail bitmap. */
    fun preferredThumbnailWidth(): Int

    /** Shows the "Live page" toast, indicating the reveal has swapped from cached to live. */
    fun showLivePageToast()

    /** Releases view resources. Called from [TabReloadCoverFeature.stop]. */
    fun detach()
}

/** [CoverPresenter] backed by the [tabReloadCover] `ImageView` sibling of `swipeRefresh` in `fragment_browser.xml`. */
internal class ImageViewCoverPresenter(private val coverView: ImageView) : CoverPresenter {

    private var dismissCallback: (() -> Unit)? = null

    override fun onDismissedByTouch(callback: () -> Unit) {
        dismissCallback = callback
    }

    override fun preferredThumbnailWidth(): Int =
        coverView.width.takeIf { it > 0 } ?: coverView.context.resources.displayMetrics.widthPixels

    // ClickableViewAccessibility: the listener returns false so the cover never consumes the gesture,
    // and has no click semantics for accessibility services to surface.
    @SuppressLint("ClickableViewAccessibility")
    override fun show(bitmap: Bitmap) {
        coverView.setImageBitmap(bitmap)
        // Mirror the engine-view parent's translationY. EngineViewClippingBehavior offsets the
        // engine host down by the top toolbar height so the toolbar sits above it; without the
        // same offset on the cover, cover content is drawn `topToolbarHeight` px higher than
        // live content and the page appears to drop when the cover is hidden.
        coverView.translationY = coverView.rootView.findViewById<View>(R.id.swipeRefresh)?.translationY ?: 0f
        // The cover is a static bitmap and cannot follow a scroll, so treat the first touch as
        // "show me the live page": dismiss without the fade and return false so the gesture carries
        // on to the engine view. Otherwise the page scrolls underneath a frozen image and ends up
        // displaced on reveal. Handled locally rather than routed through the state machine so the
        // touch works even during the post-hide fade (when the machine has already returned to Idle).
        coverView.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                hideImmediately()
                dismissCallback?.invoke()
            }
            false
        }
        coverView.alpha = 0f
        coverView.visibility = View.VISIBLE
        coverView.animate().alpha(1f).setDuration(COVER_FADE_IN_DURATION_MS)
    }

    override fun hideWithFade() {
        // Idempotent: if the cover is already hidden (e.g., user-dismissed during the state machine's
        // finalize path), don't restart the fade — the view state has already been reset.
        if (coverView.visibility != View.VISIBLE) return
        // Keep the touch listener attached for the length of the fade. The cover is still on screen
        // and still static during it, so a touch must dismiss it here too; clearing the listener up
        // front would let the gesture through to a page that then scrolls behind a visible cover.
        coverView.animate().alpha(0f).setDuration(COVER_HIDE_ANIMATION_DURATION_MS).withEndAction {
            resetViewState()
        }
    }

    override fun hideImmediately() {
        // cancel() intentionally skips the fade's withEndAction; resetViewState below does the cleanup.
        coverView.animate().cancel()
        resetViewState()
    }

    override fun detach() {
        coverView.animate().cancel()
        resetViewState()
    }

    // A Toast composes its own window params for the inflated view root, so the null LayoutInflater root here is
    // intentional. Suppressing InflateParams for that reason only.
    @SuppressLint("InflateParams")
    override fun showLivePageToast() {
        val context = coverView.context
        val toastView = LayoutInflater.from(context).inflate(R.layout.tab_reload_toast, null)
        toastView.findViewById<TextView>(R.id.tab_reload_toast_text).setText(R.string.browser_toolbar_live_page_toast)
        @Suppress("DEPRECATION")
        Toast(context)
            .apply {
                view = toastView
                duration = Toast.LENGTH_SHORT
            }
            .show()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun resetViewState() {
        coverView.setOnTouchListener(null)
        coverView.visibility = View.GONE
        coverView.alpha = 1f
        coverView.translationY = 0f
        coverView.setImageBitmap(null)
    }
}
