/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import android.content.res.Resources
import android.graphics.Rect
import android.view.TouchDelegate
import android.view.View
import androidx.annotation.DimenRes
import androidx.annotation.Dimension
import androidx.annotation.Dimension.Companion.DP
import androidx.annotation.VisibleForTesting
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import mozilla.components.support.ktx.android.util.dpToPx
import mozilla.components.support.utils.ext.bottom
import org.mozilla.fenix.components.Components

/**
 * [View] helper to retrieve the [Components.settings].
 */
fun View.settings() = context.components.settings

fun View.increaseTapArea(
    @Dimension(unit = DP) extraDps: Int,
) {
    val extraPx = extraDps.dpToPx(resources.displayMetrics)
    increaseTapAreaInternal(extraPx)
}

@VisibleForTesting
internal fun View.increaseTapAreaInternal(extraPx: Int) {
    val parent = this.parent as View
    parent.post {
        val touchRect = Rect()
        getHitRect(touchRect)
        touchRect.inset(-extraPx, -extraPx)
        parent.touchDelegate = TouchDelegate(touchRect, this)
    }
}

/**
 * Increase tap area only vertically.
 *
 * @param extraDps the extra dps that's wanted to be added on top and bottom of the view
 */
fun View.increaseTapAreaVertically(
    @Dimension(unit = DP) extraDps: Int,
) {
    val dips = extraDps.dpToPx(resources.displayMetrics)
    val parent = this.parent as View
    parent.post {
        val touchArea = Rect()
        getHitRect(touchArea)
        touchArea.top -= dips
        touchArea.bottom += dips
        parent.touchDelegate = TouchDelegate(touchArea, this)
    }
}

fun View.removeTouchDelegate() {
    val parent = this.parent as View
    parent.post {
        parent.touchDelegate = null
    }
}

/**
 * Fills a [Rect] with data about a view's location in the screen.
 *
 * @see android.view.View.getLocationOnScreen
 * @see mozilla.components.support.ktx.android.view.getRectWithViewLocation for a version of this
 * that is relative to a window
 */
fun View.getRectWithScreenLocation(): Rect {
    val locationOnScreen = IntArray(2).apply { getLocationOnScreen(this) }
    return Rect(
        locationOnScreen[0],
        locationOnScreen[1],
        locationOnScreen[0] + width,
        locationOnScreen[1] + height,
    )
}

/**
 * A safer version of [ViewCompat.getRootWindowInsets] that does not throw a NullPointerException
 * if the view is not attached.
 */
fun View.getWindowInsets(): WindowInsetsCompat? {
    return rootWindowInsets?.let {
        WindowInsetsCompat.toWindowInsetsCompat(it)
    }
}

/**
 * Checks if the keyboard is visible
 *
 * Inspired by https://stackoverflow.com/questions/2150078/how-to-check-visibility-of-software-keyboard-in-android
 * API 30 adds a native method for this. We should use it (and a compat method if one
 * is added) when it becomes available
 */
fun View.isKeyboardVisible(): Boolean {
    // Since we have insets, we don't need to guess what the keyboard height is.
    return isKeyboardVisible(getKeyboardHeight())
}

@VisibleForTesting
internal fun isKeyboardVisible(keyboardHeight: Int): Boolean {
    val minimumKeyboardHeight = 0
    return keyboardHeight > minimumKeyboardHeight
}

@VisibleForTesting
internal fun View.getWindowVisibleDisplayFrame(): Rect = with(Rect()) {
    getWindowVisibleDisplayFrame(this)
    this
}

/**
 * Calculates the height of the onscreen keyboard.
 */
fun View.getKeyboardHeight(): Int {
    return getKeyboardHeight(
        rootViewHeight = rootView.height,
        windowVisibleDisplayFrame = getWindowVisibleDisplayFrame(),
        bottomInset = getWindowInsets()?.bottom() ?: 0,
    )
}

@VisibleForTesting
internal fun getKeyboardHeight(
    rootViewHeight: Int,
    windowVisibleDisplayFrame: Rect,
    bottomInset: Int,
): Int {
    val statusBarHeight = windowVisibleDisplayFrame.top
    return rootViewHeight - (windowVisibleDisplayFrame.height() + statusBarHeight) - bottomInset
}

/**
 * Returns the pixel size for the given dimension resource ID.
 *
 * This is a wrapper around [Resources.getDimensionPixelSize], reducing verbosity when accessing
 * dimension values from a [View].
 *
 * @param resId Resource ID of the dimension.
 * @return The pixel size corresponding to the given dimension resource.
 */
fun View.pixelSizeFor(
    @DimenRes resId: Int,
) = resources.getDimensionPixelSize(resId)
