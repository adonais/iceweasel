/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package mozilla.components.feature.ipprotection.auth

import kotlinx.coroutines.CoroutineScope
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.feature.ipprotection.IPProtectionFeature

/**
 * Configures optional providers for initialization.
 *
 * This keeps [IPProtectionFeature] agnostic of optional handler
 * capabilities (such as Google Play Integrity).
 *
 * N.B: Implementations are invoked once, after the handler is registered and its auth provider is set, and before
 * [IPProtectionHandler.init].
 */
interface IPProtectionAuthProvider {
    /**
     * Configures the provider.
     *
     * @param handler The [IPProtectionHandler] to configure.
     * @param scope The [CoroutineScope] to use for asynchronous work.
     */
    fun configure(handler: IPProtectionHandler, scope: CoroutineScope)
}
