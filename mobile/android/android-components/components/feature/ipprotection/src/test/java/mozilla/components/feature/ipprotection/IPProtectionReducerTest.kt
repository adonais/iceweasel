/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo.Companion.PROXY_STATE_ACTIVATING
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo.Companion.PROXY_STATE_ACTIVE
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo.Companion.PROXY_STATE_ERROR
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo.Companion.PROXY_STATE_PAUSED
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler.StateInfo.Companion.PROXY_STATE_READY
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.iPProtectionReducer
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.Authorized
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalAndroidComponentsApi::class)
class IPProtectionReducerTest {

    private val defaultState = IPProtectionState()

    @Test
    fun `WHEN EligibilityChanged is dispatched THEN eligibilityStatus is updated`() {
        assertEquals(
            defaultState.copy(eligibilityStatus = EligibilityStatus.Eligible),
            iPProtectionReducer(
                defaultState,
                IPProtectionAction.EligibilityChanged(EligibilityStatus.Eligible),
            ),
        )
    }

    @Test
    fun `WHEN ToolkitStateChanged is dispatched THEN data fields are updated`() {
        val info = StateInfo(
            serviceState = ServiceState.Uninitialized,
            remaining = 1000L,
            max = 5000L,
            resetTime = "2026-06-01T00:00:00Z",
        )
        assertEquals(
            defaultState.copy(
                remainingDataBytes = 1000L,
                maxDataBytes = 5000L,
                resetDate = "2026-06-01T00:00:00Z",
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN service is ready and proxy state is ready THEN proxyStatus is Idle`() {
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_READY)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Idle,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN service is ready and proxy state is activating THEN proxyStatus is Activating`() {
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ACTIVATING)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Activating,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN service is ready and proxy state is active THEN proxyStatus is Active`() {
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ACTIVE)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Active,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN service is ready and proxy state is paused THEN proxyStatus is DataLimitReached`() {
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_PAUSED)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.DataLimitReached,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN service is ready and proxy state is error THEN proxyStatus is ConnectionError`() {
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ERROR)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.ConnectionError,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(defaultState, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN ProxyActiveShown is dispatched THEN proxyActiveShown is true`() {
        assertEquals(
            defaultState.copy(proxyActiveShown = true),
            iPProtectionReducer(defaultState, IPProtectionAction.ProxyActiveShown),
        )
    }

    @Test
    fun `WHEN proxy becomes active and proxyActiveShown was true THEN proxyActiveShown is preserved`() {
        val state = defaultState.copy(proxyActiveShown = true)
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ACTIVE)
        assertEquals(
            state.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Active,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(state, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN proxy becomes activating and proxyActiveShown was true THEN proxyActiveShown is preserved`() {
        val state = defaultState.copy(proxyActiveShown = true)
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ACTIVATING)
        assertEquals(
            state.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Activating,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(state, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN proxy becomes idle and proxyActiveShown was true THEN proxyActiveShown is reset`() {
        val state = defaultState.copy(proxyActiveShown = true)
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_READY)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.Idle,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(state, IPProtectionAction.EngineStateChanged(info)),
        )
    }

    @Test
    fun `WHEN proxy errors and proxyActiveShown was true THEN proxyActiveShown is reset`() {
        val state = defaultState.copy(proxyActiveShown = true)
        val info = StateInfo(serviceState = ServiceState.Ready, proxyState = PROXY_STATE_ERROR)
        assertEquals(
            defaultState.copy(
                serviceStatus = ServiceState.Ready,
                proxyStatus = Authorized.ConnectionError,
                accountState = defaultState.accountState.copy(status = AccountStatus.Ready),
            ),
            iPProtectionReducer(state, IPProtectionAction.EngineStateChanged(info)),
        )
    }
}
