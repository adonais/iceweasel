/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.binding

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
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.ui.TabManagementFragment
import org.mozilla.fenix.utils.Settings

/**
 * Sets [TabManagementFragment] flags to secure when private tabs list is selected.
 */
class SecureTabManagerBinding(
    store: TabsTrayStore,
    private val settings: Settings,
    private val fragment: Fragment,
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
                } else if (!settings.lastKnownMode.isPrivate) {
                    setSecureMode(false)
                }
            }
    }

    override fun stop() {
        super.stop()
        if (!settings.lastKnownMode.isPrivate) {
            setSecureMode(false)
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
