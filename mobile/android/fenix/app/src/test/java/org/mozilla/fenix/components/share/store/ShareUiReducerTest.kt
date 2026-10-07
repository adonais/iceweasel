/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share.store

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.Test
import mozilla.components.concept.sync.Device
import mozilla.components.concept.sync.DeviceCapability
import mozilla.components.concept.sync.DeviceType
import org.junit.Assert.assertEquals
import org.junit.runner.RunWith
import org.mozilla.fenix.share.listadapters.SyncShareOption

@RunWith(AndroidJUnit4::class)
class ShareUiReducerTest {
    @Test
    fun `WHEN UpdateDevices action is dispatched THEN the devices are updated and loading set to false`() {
        val initialState = ShareUiState.initial
        val store = ShareUiStore(initialState = initialState)

        val expected =
            initialState.copy(
                devices = listOf(SyncShareOption.SignIn),
                isLoading = false,
            )

        store.dispatch(ShareUiAction.UpdateDevices(devices = listOf(SyncShareOption.SignIn)))

        assertEquals(expected, store.state)
    }

    @Test
    fun `WHEN Loading action is dispatched THEN loading is set to true`() {
        val initialState = ShareUiState.initial
        val store = ShareUiStore()

        val expected = initialState.copy(isLoading = true)
        store.dispatch(ShareUiAction.Loading)

        assertEquals(expected, store.state)
    }

    @Test
    fun `WHEN DeviceSelectionToggle action is dispatched THEN the device selection is toggled`() {
        val device1 =
            SyncShareOption.SingleDevice(
                device =
                    Device(
                        id = "id",
                        displayName = "display name",
                        deviceType = DeviceType.DESKTOP,
                        isCurrentDevice = true,
                        lastAccessTime = 500L,
                        capabilities = listOf(DeviceCapability.SEND_TAB),
                        subscriptionExpired = false,
                        subscription = null,
                    )
            )
        val initialState =
            ShareUiState(
                devices = listOf(device1),
                selectedDevices = setOf(device1),
            )
        val store = ShareUiStore(initialState)

        store.dispatch(ShareUiAction.DeviceSelectionToggle(device1))

        val expectedNoDevicesSelected = initialState.copy(selectedDevices = setOf())
        assertEquals(expectedNoDevicesSelected, store.state)

        store.dispatch(ShareUiAction.DeviceSelectionToggle(device1))

        val expectedDeviceSelected = initialState.copy(selectedDevices = setOf(device1))
        assertEquals(expectedDeviceSelected, store.state)
    }
}
