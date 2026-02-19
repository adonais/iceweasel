/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.appservices.relay.RelayApiException
import mozilla.appservices.relay.RelayClient
import mozilla.appservices.relay.RelayProfile
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.support.base.log.logger.Logger

const val RELAY_SCOPE_URL = "https://identity.mozilla.com/apps/relay"
const val RELAY_BASE_URL = "https://relay.firefox.com"

/**
 * Service wrapper for Firefox Relay APIs.
 *
 * @param account An [OAuthAccount] used to obtain and manage FxA access tokens scoped for Firefox Relay.
 */
class FxRelay(
    private val account: OAuthAccount,
) {
    private val logger = Logger("FxRelay")

    /**
     * Cache for RelayClient so we don't recreate the Rust client on every call.
     * We tie it to the access token it was built with.
     */
    private var cachedClient: RelayClient? = null
    private var cachedToken: String? = null

    /**
     * Defines supported Relay operations for logging and error handling.
     */
    enum class RelayOperation {
        CREATE_ADDRESS,
        ACCEPT_TERMS,
        FETCH_ALL_ADDRESSES,
        FETCH_PROFILE,
    }

    /**
     * Build or reuse a [RelayClient] with a fresh token.
     * If no token is available, fail fast with an error.
     *
     * @throws RelayApiException.Other if no FxA access token is available.
     */
    private suspend fun getOrCreateClient(): RelayClient {
        val token = account.getAccessToken(RELAY_SCOPE_URL)?.token
            ?: throw RelayApiException.Other("No FxA access token available for Relay")

        return cachedClient.takeIf { cachedToken == token }
            ?: RelayClient(RELAY_BASE_URL, token).also {
                cachedClient = it
                cachedToken = token
            }
    }

    /**
     * Runs a provided [block], handling known [RelayApiException] variants gracefully.
     *
     * @param operation The [RelayOperation] being performed, included in log output.
     * @param fallback A lambda to execute if [block] fails with a [RelayApiException].
     *                 Typically returns a safe fallback value so callers don't crash.
     * @param block A suspendable lambda to execute which may fail with a [RelayApiException].
     * @return The result of [block] if successful, or the result of [fallback] if a [RelayApiException] occurs.
     *
     * @throws Exception if any unexpected exception (not a [RelayApiException]) is thrown by [block].
     */
    private suspend fun <T> handleRelayExceptions(
        operation: RelayOperation,
        fallback: () -> T,
        block: suspend () -> T,
    ): T {
        return try {
            block()
        } catch (e: RelayApiException) {
            when (e) {
                is RelayApiException.Api -> {
                    logger.error(
                        "Relay API error during $operation: (status=${e.status}, code=${e.code}): ${e.detail}",
                        e,
                    )
                }

                is RelayApiException.Network -> {
                    logger.error("Relay network error during $operation: ${e.reason}", e)
                }

                is RelayApiException.Other -> {
                    logger.error("Unexpected Relay error during $operation: ${e.reason}", e)
                }
            }
            fallback()
        }
    }

    /**
     * Accept the Relay terms of service.
     */
    suspend fun acceptTerms() = withContext(Dispatchers.IO) {
        handleRelayExceptions(RelayOperation.ACCEPT_TERMS, { false }) {
            val client = getOrCreateClient()
            client.acceptTerms()
            true
        }
    }

    /**
     * Fetch all Relay addresses.
     *
     * This returns `null` when the operation failed with a known Relay API error.
     */
    suspend fun fetchAllAddresses(): List<RelayAddress> = withContext(Dispatchers.IO) {
        handleRelayExceptions(
            RelayOperation.FETCH_ALL_ADDRESSES,
            { emptyList() },
        ) {
            val client = getOrCreateClient()
            client.fetchAddresses().map { it.into() }
        }
    }

    /**
     * Retrieves the [RelayProfile] for the authenticated user.
     *
     * @return The user's [RelayProfile] or `null` if the operation failed.
     */
    suspend fun fetchProfile(): RelayProfile? = withContext(Dispatchers.IO) {
        handleRelayExceptions(
            RelayOperation.FETCH_PROFILE,
            { null },
        ) {
            val client = getOrCreateClient()
            client.fetchProfile()
        }
    }
}
