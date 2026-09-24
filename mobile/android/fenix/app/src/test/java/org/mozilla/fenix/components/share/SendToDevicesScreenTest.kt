/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import mozilla.components.concept.sync.Device
import mozilla.components.concept.sync.DeviceType
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.share.listadapters.SyncShareOption

class SendToDevicesScreenTest {

    private fun device(id: String) =
        SyncShareOption.SingleDevice(
            device =
                Device(
                    id = id,
                    displayName = id,
                    deviceType = DeviceType.DESKTOP,
                    isCurrentDevice = false,
                    lastAccessTime = null,
                    capabilities = emptyList(),
                    subscriptionExpired = false,
                    subscription = null,
                )
        )

    @Test
    fun `WHEN offline THEN the offline state is shown`() {
        assertEquals(
            SendToDevicesUiMode.Offline,
            sendToDevicesUiMode(false, listOf(SyncShareOption.Offline)),
        )
    }

    @Test
    fun `WHEN the account needs reauth THEN the reconnect state is shown`() {
        assertEquals(
            SendToDevicesUiMode.Reconnect,
            sendToDevicesUiMode(false, listOf(SyncShareOption.Reconnect)),
        )
    }

    @Test
    fun `WHEN offline alongside devices THEN offline state shown over the device list`() {
        assertEquals(
            SendToDevicesUiMode.Offline,
            sendToDevicesUiMode(false, listOf(SyncShareOption.Offline, device("a"))),
        )
    }

    @Test
    fun `WHEN there are no devices to send to THEN the connect-a-device state is shown`() {
        assertEquals(
            SendToDevicesUiMode.NoDevices,
            sendToDevicesUiMode(false, emptyList()),
        )
        assertEquals(
            SendToDevicesUiMode.NoDevices,
            sendToDevicesUiMode(false, listOf(SyncShareOption.AddNewDevice)),
        )
    }

    @Test
    fun `WHEN the user needs to sign-in and the dialog is open THEN the sign-in state is shown`() {
        assertEquals(
            SendToDevicesUiMode.SignIn,
            sendToDevicesUiMode(false, listOf(SyncShareOption.SignIn)),
        )
    }

    @Test
    fun `WHEN there are devices to send to THEN the device list is shown`() {
        assertEquals(
            SendToDevicesUiMode.DeviceList,
            sendToDevicesUiMode(false, listOf(device("a"))),
        )
        assertEquals(
            SendToDevicesUiMode.DeviceList,
            sendToDevicesUiMode(
                false,
                listOf(
                    device("a"),
                    device("b"),
                    SyncShareOption.SendAll(emptyList()),
                ),
            ),
        )
    }

    @Test
    fun `WHEN loading THEN the loading state is shown`() {
        assertEquals(
            SendToDevicesUiMode.Loading,
            sendToDevicesUiMode(true, emptyList()),
        )
    }
}
