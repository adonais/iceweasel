/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa

/**
 * Scope for clients to access certain Firefox Accounts services.
 *
 * See [Fxa Ecosystem Platform](https://mozilla.github.io/ecosystem-platform/reference/oauth-details#oauth-scopes) for
 * more information about the scopes, and why some are URL-shaped.
 *
 * It is possible that an [FxaService] might combine one or more of these scopes.
 */
@JvmInline
value class FxaScope private constructor(val value: String) {

    companion object {
        /**
         * Scope necessary to fetch a profile. The profile scope is often needed for a browser-based oauth flow, in
         * order to be able to display the display name, avatar, etc. So it is expected that many [FxaService]s will
         * need it.
         */
        val PROFILE = FxaScope(value = "profile")

        /** Scope necessary to obtain sync keys. */
        val SYNC = FxaScope(value = "https://identity.mozilla.com/apps/oldsync")

        /** Scope necessary to obtain a sessionToken, which gives full access to the account. */
        val SESSION = FxaScope(value = "https://identity.mozilla.com/tokens/session")

        /** Scope necessary to access the IP Protection service. */
        val IP_PROTECTION = FxaScope(value = "https://identity.mozilla.com/apps/vpn")

        /** Scope necessary to access the Firefox Accounts relay service. */
        val RELAY = FxaScope(value = "https://identity.mozilla.com/apps/relay")
    }
}
