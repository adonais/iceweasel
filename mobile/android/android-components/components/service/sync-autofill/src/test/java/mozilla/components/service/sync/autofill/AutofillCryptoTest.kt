/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.sync.autofill

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.runTest
import mozilla.appservices.RustComponentsInitializer
import mozilla.components.concept.storage.KeyGenerationReason
import mozilla.components.lib.dataprotect.SecureAbove22Preferences
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions

@RunWith(AndroidJUnit4::class)
class AutofillCryptoTest {

    private lateinit var securePrefs: SecureAbove22Preferences

    @Before
    fun setup() {
        RustComponentsInitializer.init()
        // forceInsecure is set in the tests because a keystore wouldn't be configured in the test environment.
        securePrefs = SecureAbove22Preferences(testContext, "autofill", forceInsecure = true)
    }

    @Test
    fun `get key - new`() = runTest {
        val storage = mock<AutofillCreditCardsAddressesStorage>()
        val crypto = AutofillCrypto(testContext, securePrefs, storage)
        val key = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.New, key.wasGenerated)

        // key was persisted, subsequent fetches return it.
        val key2 = crypto.getOrGenerateKey()
        assertNull(key2.wasGenerated)

        assertEquals(key.key, key2.key)
        verifyNoInteractions(storage)
    }

    @Test
    fun `get key - lost`() = runTest {
        val storage = mock<AutofillCreditCardsAddressesStorage>()
        val crypto = AutofillCrypto(testContext, securePrefs, storage)
        val key = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.New, key.wasGenerated)

        // now, let's loose the key. It'll be regenerated
        securePrefs.clear()
        val key2 = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.RecoveryNeeded.Lost, key2.wasGenerated)

        assertNotEquals(key.key, key2.key)
        verify(storage).scrubEncryptedData()
    }

    @Test
    fun `get key - corrupted`() = runTest {
        val storage = mock<AutofillCreditCardsAddressesStorage>()
        val crypto = AutofillCrypto(testContext, securePrefs, storage)
        val key = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.New, key.wasGenerated)

        // now, let's corrupt the key. It'll be regenerated
        securePrefs.putString(AutofillCrypto.AUTOFILL_KEY, "garbage")

        val key2 = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.RecoveryNeeded.Corrupt, key2.wasGenerated)

        assertNotEquals(key.key, key2.key)
        verify(storage).scrubEncryptedData()
    }

    @Test
    fun `get key - corrupted subtly`() = runTest {
        val storage = mock<AutofillCreditCardsAddressesStorage>()
        val crypto = AutofillCrypto(testContext, securePrefs, storage)
        val key = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.New, key.wasGenerated)

        // now, let's corrupt the key. It'll be regenerated
        // this key is shaped correctly, but of course it won't be the same as what we got back in the first call to
        // key()
        securePrefs.putString(
            AutofillCrypto.AUTOFILL_KEY,
            "{\"kty\":\"oct\",\"k\":\"GhsmEtujZN_qMEgw1ZHhcJhdAFR9EkUgb94qANel-P4\"}",
        )

        val key2 = crypto.getOrGenerateKey()
        assertEquals(KeyGenerationReason.RecoveryNeeded.Corrupt, key2.wasGenerated)

        assertNotEquals(key.key, key2.key)
        verify(storage).scrubEncryptedData()
    }
}
