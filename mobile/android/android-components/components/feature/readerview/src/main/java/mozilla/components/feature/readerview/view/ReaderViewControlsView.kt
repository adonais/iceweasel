/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.readerview.view

import android.view.View
import mozilla.components.feature.readerview.ReaderViewFeature.ColorScheme
import mozilla.components.feature.readerview.ReaderViewFeature.FontType

/** An interface for views that can display ReaderView appearance controls (e.g. font size, font type). */
interface ReaderViewControlsView {

    var listener: Listener?

    /** Sets the selected font option. */
    fun setFont(font: FontType)

    /** Sets the selected font size. */
    fun setFontSize(size: Int)

    /** Sets the selected color scheme. */
    fun setColorScheme(scheme: ColorScheme)

    /** Makes the UI controls visible and requests focus. */
    fun showControls()

    /** Makes the UI controls invisible. */
    fun hideControls()

    /** Casts this [ReaderViewControlsView] interface to an actual Android [View] object. */
    fun asView(): View = (this as View)

    /**
     * Tries to inflate the view if needed.
     *
     * See: https://github.com/mozilla-mobile/android-components/issues/5491
     *
     * @return true if the inflation was completed, false if the view was already inflated.
     */
    fun tryInflate(isListenEnabled: Boolean): Boolean

    interface Listener {
        /** Invoked when the user selects a new font type. */
        fun onFontChanged(font: FontType)

        /**
         * Invoked when the user requests a larger font size.
         *
         * @return the resulting font size, in the range [MIN_TEXT_SIZE] to [MAX_TEXT_SIZE].
         */
        fun onFontSizeIncreased(): Int

        /**
         * Invoked when the user requests a smaller font size.
         *
         * @return the resulting font size, in the range [MIN_TEXT_SIZE] to [MAX_TEXT_SIZE].
         */
        fun onFontSizeDecreased(): Int

        /** Invoked when the user selects a new color scheme. */
        fun onColorSchemeChanged(scheme: ColorScheme)

        /** Invoked when the listen button is clicked. */
        fun onListenClicked()
    }
}
