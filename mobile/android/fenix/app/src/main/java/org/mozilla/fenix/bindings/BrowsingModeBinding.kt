/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bindings

import android.view.Window
import android.view.WindowManager.LayoutParams.FLAG_SECURE
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager
import org.mozilla.fenix.browser.browsingmode.DefaultBrowsingModeManager
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.theme.ThemeManager
import org.mozilla.fenix.utils.Settings

/**
 * A binding for observing browsing mode changes in the [AppStore] and updating
 * secure window flags, theme, and browsing mode manager accordingly.
 *
 * @param window The [Window] used to set secure flags.
 * @param settings The [Settings] used to check if secure mode should be overridden.
 * @param store The [AppStore] used to observe browsing mode changes.
 * @param themeManagerProvider A provider for the [ThemeManager] instance.
 * @param browsingModeManager The [BrowsingModeManager] to sync mode changes.
 * @param mainDispatcher The [CoroutineDispatcher] on which the state observation and updates will occur.
 *                       Defaults to [Dispatchers.Main].
 */
class BrowsingModeBinding(
    private val window: Window,
    private val settings: Settings,
    store: AppStore,
    private val themeManagerProvider: () -> ThemeManager?,
    private val browsingModeManager: BrowsingModeManager,
    mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) : AbstractBinding<AppState>(store, mainDispatcher) {

    override suspend fun onState(flow: Flow<AppState>) {
        flow.distinctUntilChangedBy { it.mode }
            .collect { state ->
                val newMode = state.mode
                updateSecureWindowFlags(newMode)

                themeManagerProvider()?.let { it.currentTheme = newMode }

                (browsingModeManager as? DefaultBrowsingModeManager)?.syncMode(newMode)
            }
    }

    private fun updateSecureWindowFlags(mode: BrowsingMode) {
        if (mode == BrowsingMode.Private && !settings.shouldSecureModeBeOverridden) {
            window.addFlags(FLAG_SECURE)
        } else {
            window.clearFlags(FLAG_SECURE)
        }
    }
}
