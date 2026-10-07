/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.lifecycle.LifecycleOwner
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlin.test.Test
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.service.fxa.manager.FxaAccountManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.runner.RunWith
import org.mozilla.fenix.components.share.store.ShareUiState
import org.mozilla.fenix.components.share.store.ShareUiStore
import org.mozilla.fenix.share.listadapters.SyncShareOption

@RunWith(AndroidJUnit4::class)
class ShareUiDevicesObserverTest {
    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var fxaAccountManager: FxaAccountManager
    private lateinit var store: ShareUiStore

    @Before
    fun setup() {
        connectivityManager = mockk(relaxed = true)
        fxaAccountManager = mockk(relaxed = true)
        store = ShareUiStore(initialState = ShareUiState.initial)
    }

    @Test
    fun `WHEN start is called THEN network callback is registered`() = runTest {
        val shareUiObserver = createObserver()

        shareUiObserver.start()

        verify {
            connectivityManager.registerNetworkCallback(
                any<NetworkRequest>(),
                any<ConnectivityManager.NetworkCallback>(),
            )
        }
    }

    @Test
    fun `GIVEN network callback not null WHEN stop is called THEN network callback is unregistered`() = runTest {
        val shareUiObserver = createObserver()

        shareUiObserver.start()
        shareUiObserver.stop()

        verify {
            connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    fun `GIVEN network callback null WHEN stop is called THEN network callback is not unregistered`() = runTest {
        val shareUiObserver = createObserver()

        shareUiObserver.stop()

        verify(exactly = 0) {
            connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    fun `GIVEN already started WHEN start is called again THEN the callback is registered only once`() = runTest {
        val shareUiObserver = createObserver()

        shareUiObserver.start()
        shareUiObserver.start()

        verify(exactly = 1) {
            connectivityManager.registerNetworkCallback(
                any<NetworkRequest>(),
                any<ConnectivityManager.NetworkCallback>(),
            )
        }
    }

    @Test
    fun `WHEN onResume is called THEN the store is updated with the devices`() = runTest {
        val capabilities =
            mockk<NetworkCapabilities> {
                every { hasCapability(any()) } returns false
            }
        every { connectivityManager.getNetworkCapabilities(any()) } returns capabilities

        createObserver().onResume(mockk<LifecycleOwner>())
        testScheduler.runCurrent()

        assertFalse(store.state.isLoading)
        assertEquals(listOf(SyncShareOption.Offline), store.state.devices)
    }

    @Test
    fun `GIVEN offline WHEN buildDeviceList is called THEN the offline option is returned`() = runTest {
        val capabilities =
            mockk<NetworkCapabilities> {
                every { hasCapability(any()) } returns false
            }
        every { connectivityManager.getNetworkCapabilities(any()) } returns capabilities

        val shareUiObserver = createObserver()

        assertEquals(listOf(SyncShareOption.Offline), shareUiObserver.buildDeviceList())
    }

    private fun TestScope.createObserver() =
        ShareUiDevicesObserver(
            store = store,
            fxaAccountManager = fxaAccountManager,
            connectivityManager = connectivityManager,
            scope = backgroundScope,
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
}
