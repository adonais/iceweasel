/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.content.Context
import android.content.IntentSender
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat

/**
 * A wrapper for ShortcutManagerCompat to simplify testing.
 *
 * This interface abstracts the static methods of ShortcutManagerCompat,
 * allowing for easier mocking and verification in unit tests.
 */
interface ShortcutManagerCompatWrapper {
    /**
     * Checks if the system supports pinning shortcuts.
     *
     * @param context The application context.
     * @return `true` if pinning shortcuts is supported, `false` otherwise.
     */
    fun isRequestPinShortcutSupported(context: Context): Boolean

    /**
     * Requests the system to pin a shortcut to the home screen.
     *
     * @param context The application context.
     * @param shortcut The [ShortcutInfoCompat] object representing the shortcut to be pinned.
     * @param intentSender An optional [IntentSender] to be notified when the shortcut is pinned or canceled.
     * @return `true` if the request was successfully sent, `false` otherwise.
     *         Note that this does not guarantee the shortcut will be pinned, as the user can cancel the request.
     */
    fun requestPinShortcut(context: Context, shortcut: ShortcutInfoCompat, intentSender: IntentSender?): Boolean

    /**
     * Publishes the list of dynamic shortcuts.
     *
     * @param context The application context.
     * @param shortcut The [ShortcutInfoCompat] object representing the shortcut to be pinned.
     */
    fun pushDynamicShortcut(context: Context, shortcut: ShortcutInfoCompat)

    /**
     * Removes specific dynamic shortcuts by their IDs.
     *
     * @param context The application context.
     * @param shortcutIds The list of unique IDs representing the shortcuts to be removed.
     */
    fun removeDynamicShortcuts(context: Context, shortcutIds: List<String>)
}

/**
 * A wrapper for [ShortcutManagerCompat] to allow for easier testing.
 */
class DefaultShortcutManagerCompatWrapper : ShortcutManagerCompatWrapper {
    override fun isRequestPinShortcutSupported(context: Context): Boolean {
        return ShortcutManagerCompat.isRequestPinShortcutSupported(context)
    }

    override fun requestPinShortcut(
        context: Context,
        shortcut: ShortcutInfoCompat,
        intentSender: IntentSender?,
    ): Boolean {
        return ShortcutManagerCompat.requestPinShortcut(context, shortcut, intentSender)
    }

    override fun pushDynamicShortcut(
        context: Context,
        shortcut: ShortcutInfoCompat,
    ) {
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
    }

    override fun removeDynamicShortcuts(
        context: Context,
        shortcutIds: List<String>,
    ) {
        ShortcutManagerCompat.removeDynamicShortcuts(context, shortcutIds)
    }
}
