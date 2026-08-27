/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.feature.ipprotection.store.InternalAction
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.EligibilityStatus
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.test.any
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.junit.Test
import org.mockito.Mockito.inOrder

@OptIn(ExperimentalAndroidComponentsApi::class)
class IPProtectionFeatureTest {

    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `WHEN the account is awaiting enrollment THEN the sign-in is announced before enrolling`() =
        runTest(testDispatcher) {
            val handler: IPProtectionHandler = mock()
            val engine: Engine = mock { whenever(registerIPProtectionDelegate(any())).thenReturn(handler) }
            val (store, _) =
                buildStore(
                    buildIPProtectionState(
                        accountStatus = AccountStatus.AwaitingAuthentication,
                        eligibilityStatus = EligibilityStatus.Eligible,
                    ),
                )

            IPProtectionFeature(
                    store = store,
                    engine = engine,
                    accountManager = mock<FxaAccountManager>(),
                    mainDispatcher = testDispatcher,
                )
                .initialize()
            testScheduler.advanceUntilIdle()

            store.dispatch(InternalAction.AccountReadyForEnrollment)
            testScheduler.advanceUntilIdle()

            // Enrollment is only usable for an account the service already knows is signed in.
            val order = inOrder(handler)
            order.verify(handler).notifyAccountStatus(true)
            order.verify(handler).enroll(any())
        }
}
