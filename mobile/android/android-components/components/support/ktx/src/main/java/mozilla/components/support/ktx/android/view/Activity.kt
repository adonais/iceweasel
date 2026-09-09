/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.ktx.android.view

import android.app.Activity
import android.os.Build.VERSION.SDK_INT
import android.os.Build.VERSION_CODES
import android.view.View
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.core.view.OnApplyWindowInsetsListener
import androidx.core.view.ViewCompat
import androidx.core.view.ViewCompat.onApplyWindowInsets
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.ktx.R
import mozilla.components.support.ktx.android.content.isEdgeToEdgeDisabled

private const val IMMERSIVE_MODE_WINDOW_INSETS_LISTENER = "IMMERSIVE_MODE_WINDOW_INSETS_LISTENER"

/**
 * Attempts to enter immersive mode - fullscreen with the status bar and navigation buttons hidden, expanding itself
 * into the notch area for devices running API 28+ on which edge-to-edge is not enforced.
 *
 * This will automatically register and use an inset listener: [View.OnApplyWindowInsetsListener] to restore immersive
 * mode if interactions with various other widgets like the keyboard or dialogs got the activity out of immersive mode
 * without [exitImmersiveMode] being called.
 *
 * @param setListenerFunction is an optional function to setup an WindowInsets listener:
 *   [View.OnApplyWindowInsetsListener] to allow having multiple listeners at the same time.
 */
fun Activity.enterImmersiveMode(
    insetsController: WindowInsetsControllerCompat = window.createWindowInsetsController(),
    setOnApplyWindowInsetsListener: (String, OnApplyWindowInsetsListener) -> Unit = { _, listener ->
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView, listener)
    },
) {
    insetsController.hideInsets()

    val insetsListener = OnApplyWindowInsetsListener { view, insetsCompat ->
        if (insetsCompat.isVisible(WindowInsetsCompat.Type.statusBars())) {
            insetsController.hideInsets()
        }
        // Allow the decor view to have a chance to process the incoming WindowInsets.
        onApplyWindowInsets(view, insetsCompat)
    }

    setOnApplyWindowInsetsListener(IMMERSIVE_MODE_WINDOW_INSETS_LISTENER, insetsListener)

    tryEnableEnterEdgeToEdge()
}

private fun WindowInsetsControllerCompat.hideInsets() {
    apply {
        hide(WindowInsetsCompat.Type.systemBars())
        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
}

/**
 * Shows the system UI windows that were hidden, thereby exiting the immersive experience. For devices running API 28+
 * on which edge-to-edge is not enforced, this function also restores the application's use of the notch area of the
 * phone to how it was before [enterImmersiveMode] was called.
 *
 * @param insetsController is an optional [WindowInsetsControllerCompat] object for controlling the window insets.
 * @param removeListenerFunction is an optional function which was used for [enterImmersiveMode].
 */
fun Activity.exitImmersiveMode(
    insetsController: WindowInsetsControllerCompat = window.createWindowInsetsController(),
    unregisterOnApplyWindowInsetsListener: (String) -> Unit = {
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView, null)
    },
) {
    insetsController.show(WindowInsetsCompat.Type.systemBars())

    unregisterOnApplyWindowInsetsListener(IMMERSIVE_MODE_WINDOW_INSETS_LISTENER)

    tryDisableEdgeToEdge()
}

/**
 * Calls [Activity.reportFullyDrawn] while also preventing crashes under some circumstances.
 *
 * @param errorLogger the logger to be used if errors are logged.
 */
fun Activity.reportFullyDrawnSafe(errorLogger: Logger) {
    try {
        reportFullyDrawn()
    } catch (e: SecurityException) {
        // This exception is throw on some Samsung devices. We were unable to identify the root
        // cause but suspect it's related to Samsung security features. See
        // https://github.com/mozilla-mobile/fenix/issues/12345#issuecomment-655058864 for details.
        //
        // We include "Fully drawn" in the log statement so that this error appears when grepping
        // for fully drawn time.
        errorLogger.error("Fully drawn - unable to call reportFullyDrawn", e)
    }
}

/**
 * For devices running Android 9 Pie, force the given activity to enter edge-to-edge mode. The display cutout mode in
 * effect beforehand is remembered so that [tryDisableEdgeToEdge] can restore it.
 *
 * The display cutout mode is only changed when edge-to-edge is not enforced, see [setLegacyDisplayCutoutMode].
 */
fun Activity.tryEnableEnterEdgeToEdge() {
    if (SDK_INT >= VERSION_CODES.P) {
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        )
        rememberDisplayCutoutMode()
        setLegacyDisplayCutoutMode(WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES)
    }
}

/**
 * For devices running Android 9 Pie, force the given activity to exit edge-to-edge mode, restoring the display cutout
 * mode that [tryEnableEnterEdgeToEdge] remembered. The cutout mode is left alone when there is nothing to restore.
 *
 * The display cutout mode is only changed when edge-to-edge is not enforced, see [setLegacyDisplayCutoutMode].
 */
fun Activity.tryDisableEdgeToEdge() {
    if (SDK_INT >= VERSION_CODES.P) {
        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        takeRememberedDisplayCutoutMode()?.let { setLegacyDisplayCutoutMode(it) }
    }
}

/** Stores this window's [WindowManager.LayoutParams.layoutInDisplayCutoutMode], which cannot be assumed. */
@RequiresApi(VERSION_CODES.P)
private fun Activity.rememberDisplayCutoutMode() {
    val decorView = window.decorView
    // WebAppActivityFeature enters on every onResume without leaving, so keep the mode from the first enter.
    if (decorView.getTag(R.id.mozac_support_ktx_tag_display_cutout_mode) != null) return

    decorView.setTag(R.id.mozac_support_ktx_tag_display_cutout_mode, window.attributes.layoutInDisplayCutoutMode)
}

/** Returns and clears the mode stored by [rememberDisplayCutoutMode], or `null` when nothing was stored. */
@RequiresApi(VERSION_CODES.P)
private fun Activity.takeRememberedDisplayCutoutMode(): Int? =
    (window.decorView.getTag(R.id.mozac_support_ktx_tag_display_cutout_mode) as? Int)?.also {
        window.decorView.setTag(R.id.mozac_support_ktx_tag_display_cutout_mode, null)
    }

/**
 * Applies [mode] to this window's [WindowManager.LayoutParams.layoutInDisplayCutoutMode].
 *
 * No-op when edge-to-edge is enforced: from Android 15 the cutout mode of a non-floating window no longer affects how
 * it is laid out.
 */
@RequiresApi(VERSION_CODES.P)
private fun Activity.setLegacyDisplayCutoutMode(mode: Int) {
    if (!isEdgeToEdgeDisabled()) return

    window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = mode }
}
