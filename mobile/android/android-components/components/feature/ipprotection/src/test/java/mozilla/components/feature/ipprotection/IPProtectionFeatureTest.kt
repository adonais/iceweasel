/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.Engine
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.IPProtectionStore
import mozilla.components.feature.ipprotection.store.InternalAction
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.feature.ipprotection.store.state.PendingActivationRequest
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.test.any
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalAndroidComponentsApi::class)
class IPProtectionFeatureTest {

    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `WHEN the account is awaiting enrollment THEN the sign-in is announced before enrolling`() =
        runTest(testDispatcher) {
            val (store, _) =
                buildStore(
                    buildIPProtectionState(
                        accountStatus = AccountStatus.AwaitingAuthentication,
                        eligibilityStatus = EligibilityStatus.Eligible,
                    )
                )
            val handler = startFeature(store)

            store.dispatch(InternalAction.AccountReadyForEnrollment)
            testScheduler.advanceUntilIdle()

            // Enrollment is only usable for an account the service already knows is signed in.
            assertEquals(
                listOf(FakeIPProtectionHandler.Call.NotifyAccountStatus(true), FakeIPProtectionHandler.Call.Enroll),
                handler.calls.filter {
                    it is FakeIPProtectionHandler.Call.NotifyAccountStatus || it is FakeIPProtectionHandler.Call.Enroll
                },
            )
        }

    @Test
    fun `GIVEN the activation is a location switch WHEN it fails THEN a location switch failure is reported`() =
        runTest(testDispatcher) {
            val (store, middleware) =
                buildStore(
                    buildIPProtectionState(eligibilityStatus = EligibilityStatus.Eligible)
                        .copy(
                            pendingActivationRequest = PendingActivationRequest.Activate("JP", isLocationSwitch = true)
                        )
                )

            startFeature(store, failing = true)

            middleware.assertFirstAction(IPProtectionAction.LocationSwitchFailed::class)
            middleware.assertNotDispatched(IPProtectionAction.ToggleFailed::class)
        }

    @Test
    fun `GIVEN the activation is not a location switch WHEN it fails THEN a toggle failure is reported`() =
        runTest(testDispatcher) {
            val (store, middleware) =
                buildStore(
                    buildIPProtectionState(eligibilityStatus = EligibilityStatus.Eligible)
                        .copy(pendingActivationRequest = PendingActivationRequest.Activate("JP"))
                )

            startFeature(store, failing = true)

            middleware.assertFirstAction(IPProtectionAction.ToggleFailed::class)
            middleware.assertNotDispatched(IPProtectionAction.LocationSwitchFailed::class)
        }

    @Test
    fun `GIVEN a deactivation WHEN it fails THEN a toggle failure is reported`() =
        runTest(testDispatcher) {
            val (store, middleware) =
                buildStore(
                    buildIPProtectionState(eligibilityStatus = EligibilityStatus.Eligible)
                        .copy(pendingActivationRequest = PendingActivationRequest.Deactivate)
                )

            startFeature(store, failing = true)

            middleware.assertFirstAction(IPProtectionAction.ToggleFailed::class)
            middleware.assertNotDispatched(IPProtectionAction.LocationSwitchFailed::class)
        }

    private fun TestScope.startFeature(store: IPProtectionStore, failing: Boolean = false): FakeIPProtectionHandler {
        val handler =
            if (failing) {
                FakeIPProtectionHandler(
                    activateResult = RuntimeException("activation rejected"),
                    deactivateResult = RuntimeException("deactivation rejected"),
                )
            } else {
                FakeIPProtectionHandler()
            }
        val engine: Engine = mock { whenever(registerIPProtectionDelegate(any())).thenReturn(handler) }

        IPProtectionFeature(
                store = store,
                engine = engine,
                accountManager = mock<FxaAccountManager>(),
                mainDispatcher = testDispatcher,
            )
            .initialize()
        testScheduler.advanceUntilIdle()

        return handler
    }
}
