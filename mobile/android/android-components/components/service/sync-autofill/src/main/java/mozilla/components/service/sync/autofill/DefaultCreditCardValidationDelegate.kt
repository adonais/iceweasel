/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.sync.autofill

import mozilla.components.concept.storage.CreditCard
import mozilla.components.concept.storage.CreditCardEntry
import mozilla.components.concept.storage.CreditCardValidationDelegate
import mozilla.components.concept.storage.CreditCardValidationDelegate.Result
import mozilla.components.concept.storage.CreditCardsAddressesStorage

/**
 * A delegate that will check against the [CreditCardsAddressesStorage] to determine if a given [CreditCard] can be
 * persisted and returns information about why it can or cannot.
 *
 * @param storage An instance of [CreditCardsAddressesStorage].
 */
class DefaultCreditCardValidationDelegate(private val storage: Lazy<CreditCardsAddressesStorage>) :
    CreditCardValidationDelegate {

    override suspend fun shouldCreateOrUpdate(creditCard: CreditCardEntry): Result {
        val creditCards = storage.value.getAllCreditCards()

        val foundCreditCard = creditCards.find { it.guid == creditCard.guid || it.cardNumber == creditCard.number }

        return if (foundCreditCard == null) {
            Result.CanBeCreated
        } else {
            Result.CanBeUpdated(foundCreditCard)
        }
    }
}
