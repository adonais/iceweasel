/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.appservices.relay.RelayAddress
import mozilla.appservices.relay.RelayApiException
import mozilla.appservices.relay.RelayClient
import mozilla.components.support.base.log.logger.Logger

/**
 * Service wrapper for Firefox Relay APIs.
 *
 * @param serverUrl The base URL of the Firefox Relay service (for example,
 *                  `https://relay.firefox.com`). This defines the endpoint
 *                  that the [RelayClient] will connect to.
 * @param authToken An optional authentication token used to authorize API
 *                  requests. If `null` or invalid, calls that require
 *                  authentication will fail gracefully via [handleRelayExceptions].
 */
class FxRelay(
    serverUrl: String,
    authToken: String? = null,
) {
    private val logger = Logger("FxRelay")
    private val client: RelayClient = RelayClient(serverUrl, authToken)

    /**
     * Defines supported Relay operations for logging and error handling.
     */
    enum class RelayOperation {
        CREATE_ADDRESS,
        ACCEPT_TERMS,
        FETCH_ALL_ADDRESSES,
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
                        "Relay API error during $operation " +
                                "(status=${e.status}, code=${e.code}): ${e.detail}",
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
            client.acceptTerms()
            true
        }
    }

    /**
     * Create a new Relay address.
     *
     * @param description description for the address
     * @param generatedFor where this alias is generated for
     * @param usedOn where this alias will be used
     */
    suspend fun createAddress(
        description: String,
        generatedFor: String,
        usedOn: String,
    ): RelayAddress? = withContext(Dispatchers.IO) {
        handleRelayExceptions(RelayOperation.CREATE_ADDRESS, { null }) {
            client.createAddress(description, generatedFor, usedOn)
        }
    }

    /**
     * Fetch all Relay addresses.
     */
    suspend fun fetchAllAddresses(): List<RelayAddress> = withContext(Dispatchers.IO) {
        handleRelayExceptions(
            RelayOperation.FETCH_ALL_ADDRESSES, { emptyList() },
        ) {
            client.fetchAddresses()
        }
    }
}
