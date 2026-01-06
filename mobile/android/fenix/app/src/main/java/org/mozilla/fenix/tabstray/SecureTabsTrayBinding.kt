/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray

import android.view.WindowManager
import androidx.annotation.VisibleForTesting
import androidx.fragment.app.Fragment
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import mozilla.components.lib.state.helpers.AbstractBinding
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged
import org.mozilla.fenix.ext.removeSecure
import org.mozilla.fenix.ext.secure
import org.mozilla.fenix.utils.Settings

/**
 * Sets TabsTrayFragment flags to secure when private tabs list is selected.
 */
class SecureTabsTrayBinding(
    store: TabsTrayStore,
    private val settings: Settings,
    private val fragment: Fragment,
    private val dialog: TabsTrayDialog,
    mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) : AbstractBinding<TabsTrayState>(store, mainDispatcher) {

    override suspend fun onState(flow: Flow<TabsTrayState>) {
        flow.map { it }
            .ifAnyChanged { state ->
                arrayOf(
                    state.selectedPage,
                )
            }
            .collect { state ->
                if (
                    state.selectedPage == Page.PrivateTabs &&
                    !settings.shouldSecureModeBeOverridden
                ) {
                    setSecureMode(true)
                    dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else if (!settings.lastKnownMode.isPrivate) {
                    setSecureMode(false)
                    dialog.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }
    }

    @VisibleForTesting
    internal fun setSecureMode(isSecure: Boolean) {
        if (isSecure) {
            fragment.secure()
        } else {
            fragment.removeSecure()
        }
    }
}
