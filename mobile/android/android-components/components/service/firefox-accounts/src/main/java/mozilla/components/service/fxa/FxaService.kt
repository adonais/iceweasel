/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa

/**
 * Firefox Accounts service and the scopes required by it.
 *
 * @property identifier An identifier for the service - will be used as part of the auth flow.
 * @property requiredScopes A set of scopes required by the service. All of the service required scopes must be present
 *   [FxaScope.PROFILE] in order for the browser-based authentication to succeed. See [FxaScope.PROFILE] for more
 */
enum class FxaService(
    val identifier: String,
    val requiredScopes: Set<FxaScope>,
) {
    /** Firefox Accounts sync service. */
    Sync(identifier = "sync", requiredScopes = setOf(FxaScope.SYNC, FxaScope.PROFILE)),

    /** Firefox Accounts IP Protection service. */
    IpProtection(identifier = "vpn", requiredScopes = setOf(FxaScope.IP_PROTECTION, FxaScope.PROFILE)),

    /** Firefox Accounts relay service. */
    Relay(identifier = "relay", requiredScopes = setOf(FxaScope.RELAY, FxaScope.PROFILE)),
}
