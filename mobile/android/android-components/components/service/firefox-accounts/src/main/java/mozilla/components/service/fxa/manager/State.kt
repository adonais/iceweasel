/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.manager

import mozilla.components.concept.sync.FxAEntryPoint
import mozilla.components.service.fxa.FxaAuthData

/** Represents the state of the account lifecycle. */
sealed class AccountState {
    /** The account manager has not initialized, so we have not determined an auth state yet. */
    object Unknown : AccountState()

    /** Account is logged in and authenticated. */
    object Authenticated : AccountState()

    /** Account needs to be re-authenticated (e.g. due to a password change). */
    object AuthenticationProblem : AccountState()

    /** No authenticated account is available (e.g. account is logged out). */
    object NotAuthenticated : AccountState()
}

internal sealed class Event {
    internal sealed class Account : Event() {
        internal object Start : Account()

        data class BeginEmailFlow(
            val service: String,
            val entrypoint: FxAEntryPoint,
            val scopes: Set<String>,
        ) : Account()

        data class BeginPairingFlow(
            val pairingUrl: String?,
            val service: String,
            val entrypoint: FxAEntryPoint,
            val scopes: Set<String>,
        ) : Account()

        data class AuthenticationError(val operation: String, val errorCountWithinTheTimeWindow: Int = 1) : Account() {
            override fun toString(): String {
                return "${this.javaClass.simpleName} - $operation"
            }
        }

        object AccessTokenKeyError : Account()

        object Logout : Account()

        data class WebChannelPasswordChange(val jsonPayload: String) : Account()
    }

    internal sealed class Progress : Event() {
        data class AuthData(val authData: FxaAuthData) : Progress()
    }
}
