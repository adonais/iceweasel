/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import androidx.annotation.VisibleForTesting
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.concept.sync.DeviceCapability
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.base.feature.LifecycleAwareFeature
import org.mozilla.fenix.components.share.store.ShareUiAction
import org.mozilla.fenix.components.share.store.ShareUiStore
import org.mozilla.fenix.ext.isOnline
import org.mozilla.fenix.share.listadapters.SyncShareOption

/**
 * [LifecycleAwareFeature] implementation that handles the initial data load and final clean up for the share sheet.
 *
 * This class handles the logic for:
 * - Retrieving synchronized devices from the Firefox Account (Fxa) to enable "Send to Device".
 * - Monitoring network connectivity to update the availability of sync-related share options.
 *
 * @param store The [ShareUiStore] to dispatch device updates to.
 * @param fxaAccountManager Manager for Firefox Account operations and device constellation data.
 * @param connectivityManager System service for monitoring network state changes.
 * @param scope The [CoroutineScope] for fetching data.
 * @param ioDispatcher The [CoroutineDispatcher] used for background operations.
 */
class ShareUiDevicesObserver(
    private val store: ShareUiStore,
    private val fxaAccountManager: FxaAccountManager,
    private val connectivityManager: ConnectivityManager?,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : LifecycleAwareFeature {
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun start() {
        registerNetworkCallback()
    }

    override fun stop() {
        networkCallback?.let {
            connectivityManager?.unregisterNetworkCallback(it)
        }
        networkCallback = null
    }

    override fun onResume(owner: LifecycleOwner) {
        loadDevices()
    }

    private fun loadDevices() {
        scope.launch {
            val devices = buildDeviceList()
            store.dispatch(ShareUiAction.UpdateDevices(devices = devices))
        }
    }

    private fun registerNetworkCallback() {
        if (networkCallback == null) {
            networkCallback =
                object : ConnectivityManager.NetworkCallback() {
                    override fun onLost(network: Network) = refreshDevices(network)

                    override fun onAvailable(network: Network) = refreshDevices(network)
                }

            networkCallback?.let { networkCallback ->
                val networkRequest = NetworkRequest.Builder().build()
                connectivityManager?.registerNetworkCallback(networkRequest, networkCallback)
            }
        }
    }

    internal fun refreshDevices(network: Network?) {
        scope.launch {
            store.dispatch(ShareUiAction.Loading)

            // Trigger FxA refresh
            fxaAccountManager.authenticatedAccount()?.deviceConstellation()?.refreshDevices()

            val devices = buildDeviceList(network)
            store.dispatch(ShareUiAction.UpdateDevices(devices))
        }
    }

    @VisibleForTesting
    internal suspend fun buildDeviceList(network: Network? = null): List<SyncShareOption> =
        withContext(ioDispatcher) {
            val account = fxaAccountManager.authenticatedAccount()
            when {
                // No network
                isOffline(network) -> listOf(SyncShareOption.Offline)
                // No account signed in
                account == null -> listOf(SyncShareOption.SignIn)
                // Account needs to be re-authenticated
                fxaAccountManager.accountNeedsReauth() -> listOf(SyncShareOption.Reconnect)
                // Signed in
                else -> {
                    val shareableDevices =
                        account
                            .deviceConstellation()
                            .state()
                            ?.otherDevices
                            .orEmpty()
                            .filter { it.capabilities.contains(DeviceCapability.SEND_TAB) }
                            .sortedByDescending { it.lastAccessTime }

                    val list = mutableListOf<SyncShareOption>()
                    if (shareableDevices.isEmpty()) {
                        // Show add device button if there are no devices
                        list.add(SyncShareOption.AddNewDevice)
                    }

                    shareableDevices.mapTo(list) { SyncShareOption.SingleDevice(it) }

                    if (shareableDevices.size > 1) {
                        // Show send all button if there are multiple devices
                        list.add(SyncShareOption.SendAll(shareableDevices))
                    }
                    list
                }
            }
        }

    private fun isOffline(network: Network?): Boolean = connectivityManager?.isOnline(network) != true
}
