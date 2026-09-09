/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.v2.AndroidComposeTestRule as AndroidComposeTestRuleV2
import androidx.test.espresso.Espresso.closeSoftKeyboard
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.customannotations.Converted
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResId
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResIdContainingText
import org.mozilla.fenix.helpers.TestAssetHelper.addressFormAsset
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.packageName
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.efficiency.data.AddressDetails
import org.mozilla.fenix.ui.robots.autofillScreen
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

class AddressAutofillTest {
    private val firstAddress =
        AddressDetails(
            name = "Mozilla Fenix Firefox",
            streetAddress = "Harrison Street",
            city = "San Francisco",
            state = "Alaska",
            zipCode = "94105",
            country = "United States",
            phoneNumber = "555-5555",
            emailAddress = "foo@bar.com",
        )

    private val secondAddress =
        AddressDetails(
            name = "Android Test Name",
            streetAddress = "Fort Street",
            city = "Alberta",
            state = "Alberta",
            zipCode = "95141",
            country = "Canada",
            phoneNumber = "777-7777",
            emailAddress = "fuu@bar.org",
        )

    @get:Rule(order = 0) val fenixTestRule: FenixTestRule = FenixTestRule()

    private val mockWebServer
        get() = fenixTestRule.mockWebServer

    @get:Rule(order = 1)
    val composeTestRule =
        AndroidComposeTestRuleV2(HomeActivityIntentTestRule.withDefaultSettingsOverrides()) { it.activity }

    @get:Rule(order = 2) val memoryLeaksRule = DetectMemoryLeaksRule(composeTestRule = { composeTestRule })

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205329
    @Converted(
        replacedBy = ["org.mozilla.fenix.ui.efficiency.tests.AddressAutofillTest#verifyAddressAutofillTest"],
        bug = 2057958,
        since = "2026-07",
    )
    @SmokeTest
    @Test
    fun verifyAddressAutofillTest() {
        val addressFormPage = mockWebServer.addressFormAsset

        autofillScreen(composeTestRule) {
                fillAndSaveAddress(
                    composeTestRule,
                    address = firstAddress,
                    navigateToAutofillSettings = true,
                )
            }
            .goBack {}
            .goBack(composeTestRule) {}
        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                clickSelectAddressButton()
                clickPageObject(
                    composeTestRule,
                    itemWithResIdContainingText(
                        "$packageName:id/address_name",
                        "Harrison Street",
                    ),
                )
                waitForAppWindowToBeUpdated()
                verifyAutofilledAddress("Harrison Street")
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205332
    @Converted(
        replacedBy = ["org.mozilla.fenix.ui.efficiency.tests.AddressAutofillTest#deleteSavedAddressTest"],
        bug = 2060174,
        since = "2026-08",
    )
    @SmokeTest
    @Test
    fun deleteSavedAddressTest() {
        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )

            clickManageAddressesButton()
            clickSavedAddress(composeTestRule, firstAddress.name)
            clickDeleteAddressButton()
            clickCancelDeleteAddressButton()
            clickDeleteAddressButton()
            clickConfirmDeleteAddressButton()
            verifyAddAddressButton()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205316
    @Test
    fun verifyAddAddressViewTest() {
        homeScreen(composeTestRule) {}
            .openThreeDotMenu {}
            .clickSettingsButton {}
            .openAutofillSubMenu(composeTestRule) {
                clickAddAddressButton()
                verifyAddAddressView()
            }
            .goBackToAutofillSettings(composeTestRule) {
                verifyAutofillToolbarTitle()
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205321
    @Test
    fun verifyEditAddressViewTest() {
        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
            clickManageAddressesButton()
            clickSavedAddress(composeTestRule, firstAddress.name)
            waitForAppWindowToBeUpdated()
            verifyEditAddressView()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205318
    @Test
    fun verifyAddressAutofillToggleTest() {
        val addressFormPage = mockWebServer.addressFormAsset

        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
        }

        exitMenu()

        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickAddressFormFieldAndVerifyAutofillSuggestionExists()
                closeSoftKeyboard()
                waitForAppWindowToBeUpdated()
            }
            .openThreeDotMenu {}
            .clickSettingsButton {}
            .openAutofillSubMenu(composeTestRule) {
                clickSaveAndAutofillAddressesOption()
                verifyAddressAutofillSection(false, true)
            }

        exitMenu()

        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                verifySelectAddressButtonExists(false)
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205330
    @Test
    fun verifyManageAddressesPromptOptionTest() {
        val addressFormPage = mockWebServer.addressFormAsset

        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
        }

        exitMenu()

        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                clickSelectAddressButton()
            }
            .clickManageAddressButton {
                verifyAutofillToolbarTitle()
            }
            .goBackToBrowser(composeTestRule) {
                verifySaveLoginPromptIsNotDisplayed()
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205319
    @Test
    fun verifyMultipleAddressesSelectionTest() {
        val addressFormPage = mockWebServer.addressFormAsset

        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
            clickManageAddressesButton()
            clickAddAddressButton()
            fillAndSaveAddress(
                composeTestRule,
                address = secondAddress,
                navigateToAutofillSettings = false,
            )
            verifyManageAddressesToolbarTitle()
        }

        exitMenu()

        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                clickSelectAddressButton()
                clickPageObject(
                    composeTestRule,
                    itemWithResIdContainingText(
                        "$packageName:id/address_name",
                        "Harrison Street",
                    ),
                )
                verifyAutofilledAddress("Harrison Street")
                clearAddressForm()
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                clickSelectAddressButton()
                clickPageObject(
                    composeTestRule,
                    itemWithResIdContainingText(
                        "$packageName:id/address_name",
                        "Fort Street",
                    ),
                )
                verifyAutofilledAddress("Fort Street")
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205322
    @Test
    fun verifySavedAddressCanBeEditedTest() {
        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
            clickManageAddressesButton()
            clickSavedAddress(composeTestRule, firstAddress.name)
            fillAndSaveAddress(
                composeTestRule,
                address = secondAddress,
                navigateToAutofillSettings = false,
            )
            verifyManageAddressesToolbarTitle()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205320
    @Test
    fun verifyStateFieldUpdatesInAccordanceWithCountryFieldTest() {
        homeScreen(composeTestRule) {}
            .openThreeDotMenu {}
            .clickSettingsButton {}
            .openAutofillSubMenu(composeTestRule) {
                verifyAddressAutofillSection(true, false)
                clickAddAddressButton()
                waitForAddressFormReady()
                clickCountryOption("United States")
                verifyCountryOption("United States")
                verifyStateOption("Alabama")
                clickCountryOption("Canada")
                verifyStateOption("Alberta")
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205331
    @Test
    fun verifyFormFieldCanBeFilledManuallyTest() {
        val addressFormPage = mockWebServer.addressFormAsset

        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
        }

        exitMenu()

        navigationToolbar(composeTestRule) {}
            .enterURLAndEnterToBrowser(addressFormPage.url) {
                clickPageObject(composeTestRule, itemWithResId("streetAddress"))
                clickSelectAddressButton()
                clickPageObject(
                    composeTestRule,
                    itemWithResIdContainingText(
                        "$packageName:id/address_name",
                        "Harrison Street",
                    ),
                )
                verifyAutofilledAddress("Harrison Street")
                setTextForApartmentTextBox("Ap. 07")
                verifyManuallyFilledAddress("Ap. 07")
            }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/3205317
    @Test
    fun verifyAutofillAddressSectionTest() {
        autofillScreen(composeTestRule) {
            fillAndSaveAddress(
                composeTestRule,
                address = firstAddress,
                navigateToAutofillSettings = true,
            )
            verifyAddressAutofillSection(true, true)
            clickManageAddressesButton()
            verifyManageAddressesSection(
                firstAddress.name,
                "Harrison Street, San Francisco, AK, US, 94105, 555-5555, foo@bar.com",
            )
        }
    }
}
