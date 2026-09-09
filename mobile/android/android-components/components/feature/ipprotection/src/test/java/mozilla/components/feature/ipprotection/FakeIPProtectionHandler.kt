/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection

import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.concept.engine.ipprotection.ServiceState

/**
 * In-memory [IPProtectionHandler] recording the requests it receives and replaying canned outcomes back through the
 * result callbacks.
 *
 * @property activateResult Passed to the `onResult` of [activate].
 * @property deactivateResult Passed to the `onResult` of [deactivate].
 * @property enrollResult Passed to the `onResult` of [enroll].
 * @property serviceState Passed to the `onResult` of [getState].
 */
internal class FakeIPProtectionHandler(
    var activateResult: Throwable? = null,
    var deactivateResult: Throwable? = null,
    var enrollResult: IPProtectionHandler.EnrollResult = IPProtectionHandler.EnrollResult(true),
    var serviceState: ServiceState = ServiceState.Uninitialized,
) : IPProtectionHandler {

    /** Every request the feature made, in the order it made them. */
    val calls = mutableListOf<Call>()

    var authProvider: IPProtectionHandler.AuthProvider? = null
        private set

    var gpiProvider: IPProtectionHandler.GpiProvider? = null
        private set

    override fun activate(countryCode: String?, onResult: (Throwable?) -> Unit) {
        calls += Call.Activate(countryCode)
        onResult(activateResult)
    }

    override fun deactivate(onResult: (Throwable?) -> Unit) {
        calls += Call.Deactivate
        onResult(deactivateResult)
    }

    override fun enroll(onResult: (IPProtectionHandler.EnrollResult) -> Unit) {
        calls += Call.Enroll
        onResult(enrollResult)
    }

    override fun getState(onResult: (ServiceState) -> Unit) {
        calls += Call.GetState
        onResult(serviceState)
    }

    override fun updateCountryList() {
        calls += Call.UpdateCountryList
    }

    override fun init() {
        calls += Call.Init
    }

    override fun uninit() {
        calls += Call.Uninit
    }

    override fun setAuthProvider(provider: IPProtectionHandler.AuthProvider?) {
        authProvider = provider
    }

    override fun setGpiProvider(provider: IPProtectionHandler.GpiProvider?) {
        gpiProvider = provider
    }

    override fun notifyAccountStatus(signedIn: Boolean) {
        calls += Call.NotifyAccountStatus(signedIn)
    }

    /** A request the feature made on the handler. */
    sealed interface Call {
        data class Activate(val countryCode: String?) : Call

        data class NotifyAccountStatus(val signedIn: Boolean) : Call

        data object Deactivate : Call

        data object Enroll : Call

        data object GetState : Call

        data object UpdateCountryList : Call

        data object Init : Call

        data object Uninit : Call
    }
}
