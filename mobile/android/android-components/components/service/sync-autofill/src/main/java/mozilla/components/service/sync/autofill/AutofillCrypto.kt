/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.sync.autofill

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import mozilla.appservices.db_crypto.DbCryptoApiException
import mozilla.appservices.db_crypto.checkCanary
import mozilla.appservices.db_crypto.createCanary
import mozilla.components.concept.storage.CreditCardCrypto
import mozilla.components.concept.storage.KeyGenerationReason
import mozilla.components.concept.storage.KeyManager
import mozilla.components.lib.dataprotect.SecureAbove22Preferences

/**
 * A class that manages the encryption key used by application-services' autofill lib to protect credit card numbers at
 * rest. It also keeps track of abnormal events, such as the managed key going missing or getting corrupted.
 *
 * @param context [Context] used for obtaining [SharedPreferences] for managing internal prefs.
 * @param securePrefs A [SecureAbove22Preferences] instance used for storing the managed key.
 */
class AutofillCrypto(
    private val context: Context,
    private val securePrefs: SecureAbove22Preferences,
    private val storage: AutofillCreditCardsAddressesStorage,
) : CreditCardCrypto, KeyManager() {
    private val plaintextPrefs by lazy { context.getSharedPreferences(AUTOFILL_PREFS, Context.MODE_PRIVATE) }

    override fun createKey() = mozilla.appservices.autofill.createKey()

    override fun isKeyRecoveryNeeded(rawKey: String, canary: String): KeyGenerationReason.RecoveryNeeded? {
        return try {
            if (checkCanary(canary, CANARY_PHRASE_PLAINTEXT, rawKey)) {
                null
            } else {
                KeyGenerationReason.RecoveryNeeded.Corrupt
            }
        } catch (e: DbCryptoApiException) {
            KeyGenerationReason.RecoveryNeeded.Corrupt
        }
    }

    override fun getStoredCanary(): String? {
        return plaintextPrefs.getString(CANARY_PHRASE_CIPHERTEXT_KEY, null)
    }

    override fun getStoredKey(): String? {
        return securePrefs.getString(AUTOFILL_KEY)
    }

    override fun storeKeyAndCanary(key: String) {
        // To consider: should this be a non-destructive operation, just in case?
        // e.g. if we thought we lost the key, but actually did not, that would let us recover data later on.
        // otherwise, if we mess up and override a perfectly good key, the data is gone for good.
        securePrefs.putString(AUTOFILL_KEY, key)
        // To detect key corruption or absence, use the newly generated key to encrypt a known string.
        // See isKeyValid below.
        plaintextPrefs.edit {
            putString(CANARY_PHRASE_CIPHERTEXT_KEY, createCanary(CANARY_PHRASE_PLAINTEXT, key))
        }
    }

    override suspend fun recoverFromKeyLoss(reason: KeyGenerationReason.RecoveryNeeded) {
        storage.scrubEncryptedData()
    }

    companion object {
        const val AUTOFILL_PREFS = "autofillCrypto"
        const val AUTOFILL_KEY = "autofillKey"
        const val CANARY_PHRASE_CIPHERTEXT_KEY = "canaryPhrase"
        const val CANARY_PHRASE_PLAINTEXT = "a string for checking validity of the key"
    }
}
