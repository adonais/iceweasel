/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import android.content.Intent
import mozilla.components.concept.sync.AuthType
import mozilla.components.concept.sync.FxAEntryPoint
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.concept.sync.StatePersistenceCallback
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.components.TelemetryAccountObserver
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.Experimentation
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.TestHelper.appContext

class NimbusEventTest {
    @get:Rule(order = 0) val fenixTestRule: FenixTestRule = FenixTestRule()

    @get:Rule
    val homeActivityTestRule =
        HomeActivityIntentTestRule.withDefaultSettingsOverrides()
            .withIntent(
                Intent().apply {
                    action = Intent.ACTION_VIEW
                }
            )

    @Rule @JvmField val retryTestRule = RetryTestRule(3)

    @Test
    fun homeScreenNimbusEventsTest() {
        Experimentation.withHelper {
            assertTrue(evalJexl("'app_opened'|eventSum('Days', 28, 0) > 0"))
        }
    }

    @Test
    fun telemetryAccountObserverTest() {
        val observer = TelemetryAccountObserver(appContext, appContext.components.settings)
        observer.onAuthenticated(UnusedOAuthAccount(), AuthType.Signin)

        Experimentation.withHelper {
            assertTrue(evalJexl("'sync_auth.sign_in'|eventSum('Days', 28, 0) > 0"))
        }
    }
}

/**
 * Stands in for the account argument of [TelemetryAccountObserver.onAuthenticated], which the observer never reads.
 * Every member throws, so any future use shows up immediately rather than silently passing.
 */
private class UnusedOAuthAccount : OAuthAccount {
    override fun getCurrentDeviceId() = unused()

    override suspend fun handleWebChannelLogin(jsonPayload: String) = unused()

    override fun getSignedInUserForWebChannel() = unused()

    override suspend fun getProfile(ignoreCache: Boolean) = unused()

    override suspend fun getAccessToken(singleScope: String) = unused()

    override suspend fun getAttachedClient() = unused()

    override fun authErrorDetected() = unused()

    override suspend fun checkAuthorizationStatus(singleScope: String) = unused()

    override suspend fun getTokenServerEndpointURL() = unused()

    override suspend fun getManageAccountURL(entryPoint: FxAEntryPoint) = unused()

    override fun getPairingAuthorityURL() = unused()

    override fun registerPersistenceCallback(callback: StatePersistenceCallback) = unused()

    override fun deviceConstellation() = unused()

    override fun hasScope(scope: String) = unused()

    override suspend fun disconnect() = unused()

    override fun toJSONString() = unused()

    override fun close() = unused()

    private fun unused(): Nothing = throw UnsupportedOperationException("not used by the code under test")
}
