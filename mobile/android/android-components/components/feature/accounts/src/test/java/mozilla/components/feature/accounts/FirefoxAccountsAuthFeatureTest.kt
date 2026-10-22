/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.accounts

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.appservices.fxaclient.FxaServer
import mozilla.components.concept.sync.FxAEntryPoint
import mozilla.components.service.fxa.ServerConfig
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.test.any
import mozilla.components.support.test.eq
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.verify

@RunWith(AndroidJUnit4::class)
class FirefoxAccountsAuthFeatureTest {

    private val testDispatcher = StandardTestDispatcher()

    private val testEntrypoint =
        object : FxAEntryPoint {
            override val entryName = "home-menu"
        }
    private val scopes = setOf("profile")

    // A proper sync sign-in URL carries the entrypoint and oauth webchannel context.
    private val entrypointUrl = "https://foo.bar/authorization?entrypoint=home-menu&context=oauth_webchannel_v1"

    private lateinit var accountManager: FxaAccountManager
    private lateinit var context: Context
    private var capturedUrl: String? = null

    @Before
    fun setup() {
        accountManager = mock()
        context = mock()
        capturedUrl = null

        val serverConfig: ServerConfig = mock()
        whenever(serverConfig.server).thenReturn(FxaServer.Custom("https://foo.bar"))
        whenever(accountManager.serverConfig).thenReturn(serverConfig)
    }

    // Stubs the pairing call (scannedUrl) and the fallback call (null pairingUrl), runs the
    // pairing flow, and returns the URL handed to onBeginAuthentication.
    private suspend fun runPairing(
        scannedUrl: String,
        pairingResult: String?,
        fallbackResult: String?,
    ): String? {
        whenever(accountManager.beginAuthentication(eq(scannedUrl), eq(testEntrypoint), any(), any()))
            .thenReturn(pairingResult)
        whenever(accountManager.beginAuthentication(eq(null), eq(testEntrypoint), any(), any()))
            .thenReturn(fallbackResult)

        val feature =
            FirefoxAccountsAuthFeature(
                accountManager,
                redirectUrl = "https://redirect",
                coroutineContext = testDispatcher,
            ) { _, url ->
                capturedUrl = url
            }

        feature.beginPairingAuthentication(context, scannedUrl, testEntrypoint, scopes)
        testDispatcher.scheduler.advanceUntilIdle()
        return capturedUrl
    }

    @Test
    fun `pairing success loads the pairing auth url`() =
        runTest(testDispatcher) {
            assertEquals(
                entrypointUrl,
                runPairing("pair://valid", pairingResult = entrypointUrl, fallbackResult = null),
            )
        }

    @Test
    fun `pairing failure falls back to an entrypoint-carrying auth url`() =
        runTest(testDispatcher) {
            assertEquals(
                entrypointUrl,
                runPairing("invalid-qr", pairingResult = null, fallbackResult = entrypointUrl),
            )
            // The fallback path must have been exercised, not just the pairing call.
            verify(accountManager).beginAuthentication(eq(null), eq(testEntrypoint), any(), any())
        }

    @Test
    fun `pairing and fallback both failing loads the server signin url`() =
        runTest(testDispatcher) {
            assertEquals(
                "https://foo.bar/signin",
                runPairing("invalid-qr", pairingResult = null, fallbackResult = null),
            )
        }
}
