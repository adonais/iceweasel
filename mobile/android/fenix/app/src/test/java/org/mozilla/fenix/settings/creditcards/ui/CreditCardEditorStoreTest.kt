/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.creditcards.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.storage.CreditCard
import mozilla.components.concept.storage.CreditCardNumber
import mozilla.components.concept.storage.CreditCardsAddressesStorage
import mozilla.components.concept.storage.NewCreditCardFields
import mozilla.components.concept.storage.UpdatableCreditCardFields
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.utils.CreditCardNetworkType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.CreditCards
import org.mozilla.fenix.helpers.FenixGleanTestRule

@RunWith(AndroidJUnit4::class)
class CreditCardEditorStoreTest {

    @get:Rule
    val coroutinesTestRule = MainCoroutineRule()

    @get:Rule
    val gleanTestRule = FenixGleanTestRule(testContext)

    private val creditCardsStorage = FakeCreditCardsStorage()
    private val calendarDataProvider = FakeCalendarDataProvider(
        expectedMonths = listOf("January", "February", "March"),
        expectedYears = listOf("2025", "2026", "2027"),
    )

    @Test
    fun `WHEN DeleteClicked event is received, delete confirmation dialog is shown`() = runTest {
        val store = makeStore()

        store.dispatch(CreditCardEditorAction.DeleteClicked)

        assertTrue(
            "Delete confirmation dialog is not shown",
            store.state.showDeleteDialog,
        )
    }

    @Test
    fun `WHEN delete confirmation is cancelled, the dialog is hidden`() = runTest {
        val store = makeStore()

        store.dispatch(CreditCardEditorAction.DeleteClicked)
        store.dispatch(CreditCardEditorAction.DeleteDialogAction.Cancel)

        assertFalse(
            "Expected delete confirmation dialog to be hidden",
            store.state.showDeleteDialog,
        )
    }

    @Test
    fun `WHEN delete confirmation is confirmed, the card is deleted`() = runTest {
        val store = makeStore(
            state = createState(guid = "card-id"),
        )

        store.dispatch(CreditCardEditorAction.DeleteDialogAction.Confirm)

        assertEquals(
            "Expected that the deleted card has guid 'card-id'",
            "card-id",
            creditCardsStorage.deletedCard,
        )
    }

    @Test
    fun `GIVEN valid form in 'edit' mode, WHEN save action is received, the card is saved`() {
        val validMasterCard = "5555444433331111"
        val store = makeStore(
            state = createState(
                guid = "1234",
                inEditMode = true,
                nameOnCard = "Jane Doe",
                cardNumber = validMasterCard,
                expiryYears = listOf("2025", "2026", "2027"),
                selectedExpiryYearIndex = 1,
                expiryMonths = listOf("January", "February", "March"),
                selectedExpiryMonthIndex = 0,
            ),
        )

        store.dispatch(CreditCardEditorAction.Save)

        val updatedCardGuid = creditCardsStorage.updatedCard?.first
        val updatedCardFields = creditCardsStorage.updatedCard?.second
        assertEquals(
            "Expected that a card is updated with the guid is 1234",
            "1234",
            updatedCardGuid,
        )
        assertEquals(
            "Expected that a card is updated with the right fields",
            UpdatableCreditCardFields(
                billingName = "Jane Doe",
                cardNumber = CreditCardNumber.Plaintext(validMasterCard),
                cardNumberLast4 = "1111",
                expiryMonth = 1,
                expiryYear = 2026L,
                cardType = "mastercard",
            ),
            updatedCardFields,
        )
    }

    @Test
    fun `GIVEN valid form in 'create' mode, WHEN save action is received, the card is saved`() {
        val validMasterCard = "5555444433331111"
        val store = makeStore(
            state = createState(
                nameOnCard = "Jane Doe",
                cardNumber = validMasterCard,
                expiryYears = listOf("2025", "2026", "2027"),
                selectedExpiryYearIndex = 1,
                expiryMonths = listOf("January", "February", "March"),
                selectedExpiryMonthIndex = 0,
            ),
        )

        store.dispatch(CreditCardEditorAction.Save)

        assertEquals(
            "Expected that a card is successfully saved with the right values",
            NewCreditCardFields(
                billingName = "Jane Doe",
                plaintextCardNumber = CreditCardNumber.Plaintext(validMasterCard),
                cardNumberLast4 = "1111",
                expiryMonth = 1,
                expiryYear = 2026L,
                cardType = "mastercard",
            ),
            creditCardsStorage.newAddedCard,
        )
    }

    @Test
    fun `GIVEN invalid card number, WHEN save action is received, an error is shown on the card field`() {
        val americanExpressCardInvalid = "371449635398432"
        val store = makeStore(
            state = createState(cardNumber = americanExpressCardInvalid),
        )

        store.dispatch(CreditCardEditorAction.Save)

        assertTrue(
            "Expected that an error is shown on the card number field",
            store.state.showCardNumberError,
        )
    }

    @Test
    fun `GIVEN empty card number, WHEN save action is received, an error is shown on the card field`() {
        val store = makeStore(
            state = createState(cardNumber = ""),
        )

        store.dispatch(CreditCardEditorAction.Save)

        assertTrue(
            "Expected that an error is shown on the card number field",
            store.state.showCardNumberError,
        )
    }

    @Test
    fun `GIVEN an empty name on card, WHEN save action is received, an error is shown on the name field`() {
        val store = makeStore(
            state = createState(nameOnCard = ""),
        )

        store.dispatch(CreditCardEditorAction.Save)

        assertTrue(
            "Expected that an error is shown on the name field",
            store.state.showNameOnCardError,
        )
    }

    @Test
    fun `WHEN cancel action is received, user is navigated back`() {
        var navigatedBack = false
        val store = makeStore(
            environment = CreditCardEditorEnvironment.Default.copy(
                navigateBack = {
                    navigatedBack = true
                },
            ),
        )

        store.dispatch(CreditCardEditorAction.Cancel)

        assertTrue(
            "Expected that we navigate back",
            navigatedBack,
        )
    }

    @Test
    fun `WHEN 'navigate back' action is received, user is navigated back`() {
        var navigatedBack = false
        val store = makeStore(
            environment = CreditCardEditorEnvironment.Default.copy(
                navigateBack = {
                    navigatedBack = true
                },
            ),
        )

        store.dispatch(CreditCardEditorAction.NavigateBack)

        assertTrue(
            "Expected that we navigate back",
            navigatedBack,
        )
    }

    @Test
    fun `WHEN Initializing without a credit card, the state is correct`() = runTest {
        calendarDataProvider.expectedMonths = listOf("January", "February")
        calendarDataProvider.expectedYears = listOf("2025", "2026")

        val initialState = CreditCardEditorState.Default
        val store = makeStore(state = initialState)

        store.dispatch(CreditCardEditorAction.Initialization.InitStarted(creditCard = null))

        assertEquals(
            "Expected that the state is loaded with everything empty",
            CreditCardEditorState(
                guid = "",
                cardNumber = "",
                showCardNumberError = false,
                nameOnCard = "",
                showNameOnCardError = false,
                expiryMonths = listOf("January", "February"),
                selectedExpiryMonthIndex = 0,
                expiryYears = listOf("2025", "2026"),
                selectedExpiryYearIndex = 0,
                inEditMode = false,
                showDeleteDialog = false,
            ),
            store.state,
        )
    }

    @Test
    fun `WHEN Initializing with a credit card, the state is initialized with the card details`() =
        runTest {
            calendarDataProvider.expectedMonths = listOf("January", "February", "March")
            calendarDataProvider.expectedYears = listOf("2025", "2026")
            val expectedEncryptedCardNumber = "encryptedCard"
            val expectedPlainCardNumber = "5555444433331111"

            creditCardsStorage.expectedPlainCardNumber = expectedPlainCardNumber
            creditCardsStorage.expectedEncryptedCardNumber = expectedEncryptedCardNumber

            val creditCard = CreditCard(
                guid = "id",
                billingName = "Banana Apple",
                encryptedCardNumber = CreditCardNumber.Encrypted(expectedEncryptedCardNumber),
                cardNumberLast4 = "1111",
                expiryMonth = 2,
                expiryYear = 2025,
                cardType = CreditCardNetworkType.MASTERCARD.cardName,
                timeCreated = 1L,
                timeLastUsed = 1L,
                timeLastModified = 1L,
                timesUsed = 1L,
            )

            val store = makeStore(state = CreditCardEditorState.Default)

            store.dispatch(CreditCardEditorAction.Initialization.InitStarted(creditCard = creditCard))

            assertEquals(
                "Expected that the state is initialized with the card details",
                CreditCardEditorState(
                    guid = "id",
                    cardNumber = expectedPlainCardNumber,
                    showCardNumberError = false,
                    nameOnCard = "Banana Apple",
                    showNameOnCardError = false,
                    expiryMonths = listOf("January", "February", "March"),
                    selectedExpiryMonthIndex = 1,
                    expiryYears = listOf("2025", "2026"),
                    selectedExpiryYearIndex = 0,
                    inEditMode = true,
                    showDeleteDialog = false,
                ),
                store.state,
            )
        }

    @Test
    fun `WHEN a card is deleted, then a telemetry event is sent`() = runTest {
        val store = makeStore(
            state = createState(guid = "card-id"),
        )

        store.dispatch(CreditCardEditorAction.DeleteDialogAction.Confirm)

        // verify that the event is sent
        assertNotNull(CreditCards.deleted.testGetValue())
    }

    @Test
    fun `WHEN a card is saved, THEN a telemetry event is sent`() = runTest {
        val store = makeStore(
            state = createState(
                nameOnCard = "Jane Doe",
                cardNumber = "5555444433331111",
                expiryYears = listOf("2025", "2026", "2027"),
                selectedExpiryYearIndex = 1,
                expiryMonths = listOf("January", "February", "March"),
                selectedExpiryMonthIndex = 0,
            ),
        )

        store.dispatch(CreditCardEditorAction.Save)

        // verify that the event is sent
        assertNotNull(CreditCards.saved.testGetValue())
    }

    @Test
    fun `WHEN a card is updated, THEN a telemetry event is sent`() = runTest {
        val store = makeStore(
            state = createState(
                guid = "1234",
                inEditMode = true,
                nameOnCard = "Jane Doe",
                cardNumber = "5555444433331111",
                expiryYears = listOf("2025", "2026", "2027"),
                selectedExpiryYearIndex = 1,
                expiryMonths = listOf("January", "February", "March"),
                selectedExpiryMonthIndex = 0,
            ),
        )

        store.dispatch(CreditCardEditorAction.Save)

        // verify that the event is sent
        assertNotNull(CreditCards.modified.testGetValue())
    }

    private fun makeStore(
        state: CreditCardEditorState = createState(),
        monthsProvider: CalendarDataProvider = calendarDataProvider,
        storage: CreditCardsAddressesStorage = creditCardsStorage,
        scope: CoroutineScope = coroutinesTestRule.scope,
        dispatcher: CoroutineDispatcher = coroutinesTestRule.testDispatcher,
        environment: CreditCardEditorEnvironment = CreditCardEditorEnvironment.Default,
    ): CreditCardEditorStore {
        return CreditCardEditorStore(
            initialState = state,
            middleware = listOf(
                CreditCardEditorMiddleware(
                    environment = environment,
                    calendarDataProvider = monthsProvider,
                    storage = storage,
                    coroutineScope = scope,
                    ioDispatcher = dispatcher,
                    mainDispatcher = dispatcher,
                ),
            ),
        )
    }
}
