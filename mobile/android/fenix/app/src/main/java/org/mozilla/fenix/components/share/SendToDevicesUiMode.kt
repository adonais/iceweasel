/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import org.mozilla.fenix.share.listadapters.SyncShareOption

/** The contents the "Send to devices" sheet can display. */
internal enum class SendToDevicesUiMode {
    Loading,
    Offline,
    Reconnect,
    SignIn,
    NoDevices,
    DeviceList,
}

/**
 * Check for problems before falling through to the device list. Otherwise, an offline or signed-out user just sees
 * "connect a device" and can't tell what actually went wrong.
 */
internal fun sendToDevicesUiMode(isLoading: Boolean, devices: List<SyncShareOption>): SendToDevicesUiMode =
    when {
        isLoading -> SendToDevicesUiMode.Loading
        devices.any { it is SyncShareOption.Offline } -> SendToDevicesUiMode.Offline
        devices.any { it is SyncShareOption.Reconnect } -> SendToDevicesUiMode.Reconnect
        devices.any { it is SyncShareOption.SignIn } -> SendToDevicesUiMode.SignIn
        devices.none { it is SyncShareOption.SingleDevice } -> SendToDevicesUiMode.NoDevices
        else -> SendToDevicesUiMode.DeviceList
    }
