/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.browsingmode

import android.content.Intent
import mozilla.components.support.utils.toSafeIntent
import org.mozilla.fenix.HomeActivity.Companion.PRIVATE_BROWSING_MODE
import org.mozilla.fenix.utils.Settings

/**
 * Enum that represents whether or not private browsing is active.
 */
enum class BrowsingMode {
    Normal, Private;

    /**
     * Returns true if the [BrowsingMode] is [Private]
     */
    val isPrivate get() = this == Private

    companion object {

        /**
         * Convert a boolean into a [BrowsingMode].
         * True corresponds to [Private] and false corresponds to [Normal].
         */
        fun fromBoolean(isPrivate: Boolean) = if (isPrivate) Private else Normal
    }
}

interface BrowsingModeManager {
    var mode: BrowsingMode

    /**
     * Updates the [BrowsingMode] based on the [Intent] that started the activity.
     *
     * @param intent The [Intent] that started the activity.
     */
    fun updateMode(intent: Intent? = null)
}

/**
 * Default implementation of [BrowsingModeManager] that tracks the current [BrowsingMode]
 * and synchronizes it with [AppStore].
 *
 * @param intent The [Intent] that started the activity.
 * @param settings [Settings] used to read the initial browsing mode from storage.
 * @param onModeChange Callback invoked when the browsing mode changes.
 */
class DefaultBrowsingModeManager(
    intent: Intent?,
    private val settings: Settings,
    private val onModeChange: (BrowsingMode) -> Unit,
) : BrowsingModeManager {
    private var currentMode: BrowsingMode = BrowsingMode.Normal

    override var mode: BrowsingMode
        get() = currentMode
        set(value) {
            if (currentMode != value) {
                currentMode = value
                onModeChange(value)
            }
        }

    init {
        mode = getModeFromIntentOrLastKnown(intent)
    }

    override fun updateMode(intent: Intent?) {
        mode = getModeFromIntentOrLastKnown(intent)
    }

    /**
     * Syncs the internal mode state without triggering the [onModeChange] callback.
     * Used when syncing from AppStore to avoid dispatch loops.
     */
    fun syncMode(value: BrowsingMode) {
        currentMode = value
    }

    /**
     * Returns the [BrowsingMode] set by the [intent] or the last known [BrowsingMode].
     */
    private fun getModeFromIntentOrLastKnown(intent: Intent?): BrowsingMode {
        intent?.toSafeIntent()?.let {
            if (it.hasExtra(PRIVATE_BROWSING_MODE)) {
                val startPrivateMode = it.getBooleanExtra(PRIVATE_BROWSING_MODE, false)
                return BrowsingMode.fromBoolean(isPrivate = startPrivateMode)
            }
        }

        return settings.lastKnownMode
    }
}
