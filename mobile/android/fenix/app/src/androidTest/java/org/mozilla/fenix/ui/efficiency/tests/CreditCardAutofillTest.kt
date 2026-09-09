/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.creditCardFormAsset
import org.mozilla.fenix.ui.efficiency.data.CreditCardTestData
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.SettingsAutofillSelectors

class CreditCardAutofillTest : BaseTest() {
    private val mockWebServer
        get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1512792
    // Converted from legacy CreditCardAutofillTest.verifyCreditCardAutofillTest
    @SmokeTest
    @Test
    fun verifyCreditCardAutofillTest() {
        val creditCardFormPage = mockWebServer.creditCardFormAsset
        val card = CreditCardTestData.FIRST

        on.settingsAutofill
            .navigateToPage()
            .fillAndSaveCreditCard(card)
            // Opening Manage cards surfaces the "secure your cards" prompt; declining it here means it
            // won't interrupt the autofill selection once we're on the web form.
            .mozClick(SettingsAutofillSelectors.MANAGE_SAVED_CREDIT_CARDS_BUTTON)
            .mozClick(SettingsAutofillSelectors.SECURED_CREDIT_CARDS_LATER_BUTTON)
            // The two clicks above descended into Manage cards, one level below the Autofill screen the
            // navigation graph thinks we're on. Return to the Autofill screen so the back-edge count to
            // reach the browser is correct (otherwise it stops one level short, on the Settings list).
            .mozPressBackUntilGone(SettingsAutofillSelectors.SAVED_CREDIT_CARD)

        on.browserPage
            .navigateToPage(creditCardFormPage.url.toString())
            .clickCreditCardNumberField()
            .clickSelectCreditCardButton()
            .clickCreditCardSuggestion(card.lastDigits)
            .verifyAutofilledCreditCard(card.number)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1512798
    // Converted from legacy CreditCardAutofillTest.deleteSavedCreditCardUsingToolbarButtonTest
    @SmokeTest
    @Test
    fun deleteSavedCreditCardUsingToolbarButtonTest() {
        val card = CreditCardTestData.FIRST

        on.settingsAutofill
            .navigateToPage()
            .fillAndSaveCreditCard(card)
            .mozClick(SettingsAutofillSelectors.MANAGE_SAVED_CREDIT_CARDS_BUTTON)
            // Opening Manage cards offers to put saved cards behind a device lock; decline so the flow
            // stays on the cards list instead of the system authentication screen.
            .mozClick(SettingsAutofillSelectors.SECURED_CREDIT_CARDS_LATER_BUTTON)
            .mozClick(SettingsAutofillSelectors.SAVED_CREDIT_CARD)
            // Cancel first, so the test also covers that cancelling leaves the card in place — the editor
            // still being open on "Edit card" is what proves nothing was deleted.
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_TOOLBAR_BUTTON)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_DIALOG_CANCEL_BUTTON)
            .mozVerify(SettingsAutofillSelectors.EDIT_CREDIT_CARD_TOOLBAR_TITLE)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_TOOLBAR_BUTTON)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_DIALOG_DELETE_BUTTON)
            // Back on the empty Autofill screen: only "Add card" remains, no "Manage cards".
            .mozVerify(SettingsAutofillSelectors.ADD_CREDIT_CARD_BUTTON)
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2271192
    // Converted from legacy CreditCardAutofillTest.deleteSavedCreditCardUsingMenuButtonTest
    @SmokeTest
    @Test
    fun deleteSavedCreditCardUsingMenuButtonTest() {
        val card = CreditCardTestData.FIRST

        on.settingsAutofill
            .navigateToPage()
            .fillAndSaveCreditCard(card)
            .mozClick(SettingsAutofillSelectors.MANAGE_SAVED_CREDIT_CARDS_BUTTON)
            // Opening Manage cards offers to put saved cards behind a device lock; decline so the flow
            // stays on the cards list instead of the system authentication screen.
            .mozClick(SettingsAutofillSelectors.SECURED_CREDIT_CARDS_LATER_BUTTON)
            .mozClick(SettingsAutofillSelectors.SAVED_CREDIT_CARD)
            // Cancel first, so the test also covers that cancelling leaves the card in place — the editor
            // still being open on "Edit card" is what proves nothing was deleted.
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_MENU_BUTTON)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_DIALOG_CANCEL_BUTTON)
            .mozVerify(SettingsAutofillSelectors.EDIT_CREDIT_CARD_TOOLBAR_TITLE)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_MENU_BUTTON)
            .mozClick(SettingsAutofillSelectors.DELETE_CREDIT_CARD_DIALOG_DELETE_BUTTON)
            // Back on the empty Autofill screen: only "Add card" remains, no "Manage cards".
            .mozVerify(SettingsAutofillSelectors.ADD_CREDIT_CARD_BUTTON)
    }
}
