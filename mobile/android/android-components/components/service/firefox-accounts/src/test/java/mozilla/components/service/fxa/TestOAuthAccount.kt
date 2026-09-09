/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa

import mozilla.components.concept.sync.AccessTokenInfo
import mozilla.components.concept.sync.AttachedClient
import mozilla.components.concept.sync.DeviceConstellation
import mozilla.components.concept.sync.FxAEntryPoint
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.concept.sync.Profile
import mozilla.components.concept.sync.StatePersistenceCallback

/** Stubbed [OAuthAccount] manager for tests */
abstract class TestOAuthAccount : OAuthAccount {
    override suspend fun getAccessToken(singleScope: String): AccessTokenInfo? = null

    override suspend fun getAttachedClient(): List<AttachedClient> = emptyList()

    override fun getCurrentDeviceId(): String? = null

    override suspend fun handleWebChannelLogin(jsonPayload: String) = Unit

    override fun getSignedInUserForWebChannel(): String? = null

    override suspend fun getProfile(ignoreCache: Boolean): Profile? = null

    override fun authErrorDetected() = Unit

    override suspend fun checkAuthorizationStatus(singleScope: String): Boolean? = null

    override suspend fun getTokenServerEndpointURL(): String? = null

    override suspend fun getManageAccountURL(entryPoint: FxAEntryPoint): String? = null

    override fun getPairingAuthorityURL() = ""

    override fun registerPersistenceCallback(callback: StatePersistenceCallback) = Unit

    override fun deviceConstellation(): DeviceConstellation = throw UnsupportedOperationException()

    override suspend fun disconnect() = false

    override fun hasScope(scope: String): Boolean = false

    override fun toJSONString() = ""

    override fun close() = Unit
}
