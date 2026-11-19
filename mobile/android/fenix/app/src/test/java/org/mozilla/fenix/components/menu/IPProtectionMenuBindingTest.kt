/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package org.mozilla.fenix.components.menu

import kotlin.test.assertNull
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.ProxyState
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.IPProtectionStore
import mozilla.components.feature.ipprotection.store.state.Authorized
import mozilla.components.feature.ipprotection.store.state.DataVolume
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.IPProtectionStatus
import mozilla.components.feature.ipprotection.store.state.ProxyStatus
import mozilla.components.feature.ipprotection.store.state.UsageQuota
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.components.menu.store.IPProtectionMenuState

class IPProtectionMenuBindingTest {
    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `GIVEN IP protection has not reported its state WHEN binding starts THEN dispatch Uninitialized status`() =
        runTest {
            var result: IPProtectionMenuState? = null
            val ipProtectionStore = IPProtectionStore()

            startBinding(ipProtectionStore) { result = it }

            assertEquals(IPProtectionStatus.Uninitialized, result?.status)
        }

    @Test
    fun `WHEN proxy status changes THEN dispatch updated menu state`() = runTest {
        var result: IPProtectionMenuState? = null
        val ipProtectionStore = IPProtectionStore(initialState = readyState(Authorized.Idle))

        startBinding(ipProtectionStore) { result = it }

        assertEquals(IPProtectionStatus.Disabled, result?.status)

        ipProtectionStore.dispatch(IPProtectionAction.ProxyAction.ProxyStateChanged(ProxyState.ACTIVE))
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(IPProtectionStatus.Enabled, result?.status)
    }

    @Test
    fun `GIVEN usage quota is metered with a max value WHEN binding starts THEN dispatch correct quota limit`() =
        runTest {
            var result: IPProtectionMenuState? = null
            val ipProtectionStore =
                IPProtectionStore(
                    initialState =
                        readyState(
                            proxyStatus = Authorized.Idle,
                            quota =
                                UsageQuota.Metered(
                                    max = DataVolume.roundedGigabytes(6),
                                    remaining = DataVolume.Zero,
                                ),
                        )
                )
            startBinding(ipProtectionStore) { result = it }

            assertEquals(DataVolume.roundedGigabytes(6), result?.dataLimit)
        }

    @Test
    fun `GIVEN usage quota is unmetered WHEN binding starts THEN dispatch null quota limit`() = runTest {
        var result: IPProtectionMenuState? = null
        val ipProtectionStore =
            IPProtectionStore(
                initialState =
                    readyState(
                        proxyStatus = Authorized.Active,
                        quota = UsageQuota.Unmetered(),
                    )
            )

        startBinding(ipProtectionStore) { result = it }

        assertNull(result?.dataLimit)
    }

    @Test
    fun `GIVEN usage quota is unavailable WHEN binding starts THEN dispatch null quota limit`() = runTest {
        var result: IPProtectionMenuState? = null
        val ipProtectionStore =
            IPProtectionStore(initialState = IPProtectionState(proxyStatus = Authorized.Active, usageQuota = null))

        startBinding(ipProtectionStore) { result = it }

        assertNull(result?.dataLimit)
    }

    private fun readyState(proxyStatus: ProxyStatus, quota: UsageQuota? = null) =
        IPProtectionState(
            eligibilityStatus = EligibilityStatus.Eligible,
            serviceStatus = ServiceState.Ready,
            proxyStatus = proxyStatus,
            usageQuota = quota,
        )

    private fun startBinding(
        ipProtectionStore: IPProtectionStore,
        onUpdate: (IPProtectionMenuState) -> Unit,
    ) {
        val binding =
            IPProtectionMenuBinding(
                ipProtectionStore = ipProtectionStore,
                onIPProtectionStatusUpdate = onUpdate,
                mainDispatcher = testDispatcher,
            )
        binding.start()
        testDispatcher.scheduler.advanceUntilIdle()
    }
}
