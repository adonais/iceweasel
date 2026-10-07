/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.sync.logins

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.StandardTestDispatcher
import mozilla.appservices.RustComponentsInitializer
import mozilla.components.concept.storage.KeyGenerationReason
import mozilla.components.lib.dataprotect.SecureAbove22Preferences
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

// Any string that is not a serialized JWK makes the db_crypto primitives fail.
private const val UNUSABLE_KEY = "not a JWK"

@RunWith(AndroidJUnit4::class)
class LoginsCryptoTest {

    private val testDispatcher = StandardTestDispatcher()

    // The storage's database connection is opened lazily on a coroutine that this test never
    // advances, so only the key manager is exercised.
    private fun crypto(): LoginsCrypto {
        RustComponentsInitializer.init()
        val securePrefs = SecureAbove22Preferences(testContext, "logins", forceInsecure = true)
        return SyncableLoginsStorage(testContext, lazy { securePrefs }, testDispatcher).crypto
    }

    @Test
    fun `GIVEN an unusable key WHEN the canary is checked THEN recovery is needed`() {
        assertEquals(
            KeyGenerationReason.RecoveryNeeded.Corrupt,
            crypto().isKeyRecoveryNeeded(UNUSABLE_KEY, "canary"),
        )
    }

    @Test
    fun `GIVEN an unusable key WHEN it is stored THEN the failure surfaces as a logins error`() {
        assertThrows(LoginsApiException::class.java) {
            crypto().storeKeyAndCanary(UNUSABLE_KEY)
        }
    }
}
