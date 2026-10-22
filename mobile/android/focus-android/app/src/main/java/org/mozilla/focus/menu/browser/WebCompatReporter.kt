/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu.browser

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toDrawable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.webextension.Action
import mozilla.components.feature.webcompat.reporter.WebCompatReporterFeature.WEBCOMPAT_REPORTER_EXTENSION_ID
import mozilla.components.lib.state.ext.flow
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.ktx.android.util.dpToPx
import org.mozilla.focus.R

private const val ICON_SIZE_DP = 24

/**
 * The action of the WebCompat Reporter extension, or `null` if reporting the current page is not possible. It both
 * names the menu item to show and reports the page when invoked.
 *
 * The extension exposes a page action, which - unlike a browser action - is only shown when explicitly enabled, which
 * the extension does for the http and https pages it can report.
 */
internal fun BrowserState.webCompatReporterAction(tab: SessionState? = selectedTab): Action? {
    val extension = extensions[WEBCOMPAT_REPORTER_EXTENSION_ID]?.takeIf { it.enabled } ?: return null

    if (!extension.allowedInPrivateBrowsing && tab?.content?.private == true) return null

    return extension.pageAction?.copyWithOverride(tab?.extensionState?.get(extension.id)?.pageAction)?.takeIf {
        it.enabled == true
    }
}

/**
 * The icon which the WebCompat Reporter extension provides for the menu item reporting the current page.
 *
 * @param context [Context] used to know in which size and color to show the icon.
 * @param browserStore [BrowserStore] from which to read the extension's action providing the icon.
 * @param action The extension's action for the page the menu is shown for.
 */
internal class WebCompatReporterIcon(
    private val context: Context,
    private val browserStore: BrowserStore,
    private val action: BrowserState.() -> Action?,
) {
    private val logger = Logger("WebCompatReporterIcon")

    /** The icon if it has already been loaded, for building a menu without waiting for it. */
    var current: Drawable? = null
        private set

    /**
     * The icon, starting with [current] so that showing the menu is not held back by loading it, and emitting again
     * once it has been loaded.
     *
     * The extension may still be starting up while the menu is shown, in which case it has no icon to load yet, so this
     * waits for it to become available instead of giving up.
     */
    fun flow(): Flow<Drawable?> = flow {
        emit(current)

        if (current == null) {
            val loadIcon = browserStore.flow().mapNotNull { it.action()?.loadIcon }.first()

            load(loadIcon)?.let { emit(it) }
        }
    }

    /**
     * The extension renders its icon in the requested size, so it is loaded once and then kept for as long as shown.
     */
    @Suppress("TooGenericExceptionCaught")
    private suspend fun load(loadIcon: suspend (Int) -> Bitmap?): Drawable? {
        val size = ICON_SIZE_DP.dpToPx(context.resources.displayMetrics)

        return try {
            loadIcon(size)
                ?.let { it.toDrawable(context.resources) }
                ?.apply { setTint(ContextCompat.getColor(context, R.color.primaryText)) }
                ?.also { current = it }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (exception: Exception) {
            logger.error("Failed to load the icon of the WebCompat Reporter extension", exception)
            null
        }
    }
}
