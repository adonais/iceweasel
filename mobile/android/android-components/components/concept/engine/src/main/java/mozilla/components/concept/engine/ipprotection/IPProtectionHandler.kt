/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.engine.ipprotection

/**
 * App-to-engine handle for controlling the IP protection proxy. Returned by
 * [mozilla.components.concept.engine.Engine.registerIPProtectionDelegate].
 */
interface IPProtectionHandler {

    /**
     * Activates the IP protection.
     */
    fun activate()

    /**
     * Deactivates the IP protection proxy.
     */
    fun deactivate()

    /**
     * Sets the [TokenProvider] used to supply authentication tokens to the IP protection service.
     * Pass null to sign out.
     *
     * @param provider The [TokenProvider], or null to deauthenticate.
     * @param onInitialState Called with the state resolved after the token provider is set.
     */
    fun setTokenProvider(
        provider: TokenProvider?,
        onInitialState: ((StateInfo) -> Unit)? = null,
    )

    /**
     * Provides a fresh authentication token on demand. Invoked each time the engine needs to
     * authenticate with the Guardian API.
     */
    interface TokenProvider {
        /**
         * Fetches a fresh authentication token and delivers it via [onComplete].
         * Pass null to [onComplete] if the token could not be obtained.
         */
        fun getToken(onComplete: (String?) -> Unit)
    }

    /**
     * Holds the current IP protection service and proxy state along with usage information.
     */
    // refactor to enum in https://bugzilla.mozilla.org/show_bug.cgi?id=2030410
    data class StateInfo(
        val serviceState: Int = SERVICE_STATE_UNINITIALIZED,
        val proxyState: Int = PROXY_STATE_NOT_READY,
        val lastError: String? = null,
        val remaining: Long = -1L,
        val max: Long = -1L,
        val resetTime: String? = null,
    ) {
        val isEnrollmentNeeded: Boolean
            get() = serviceState == SERVICE_STATE_UNAUTHENTICATED

        companion object {
            const val SERVICE_STATE_UNINITIALIZED = 0
            const val SERVICE_STATE_UNAVAILABLE = 1
            const val SERVICE_STATE_UNAUTHENTICATED = 2
            const val SERVICE_STATE_READY = 3

            const val PROXY_STATE_NOT_READY = 0
            const val PROXY_STATE_READY = 1
            const val PROXY_STATE_ACTIVATING = 2
            const val PROXY_STATE_ACTIVE = 3
            const val PROXY_STATE_ERROR = 4
            const val PROXY_STATE_PAUSED = 5
        }
    }
}
