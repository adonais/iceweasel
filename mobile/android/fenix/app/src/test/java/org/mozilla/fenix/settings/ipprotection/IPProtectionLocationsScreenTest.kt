/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalAndroidComponentsApi::class)

package org.mozilla.fenix.settings.ipprotection

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.Locale
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.compose.base.theme.Theme
import mozilla.components.feature.ipprotection.store.state.Country
import mozilla.components.feature.ipprotection.store.state.Location
import mozilla.components.feature.ipprotection.store.state.Recommended
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

private val LOCALE = Locale.US
private val JAPAN = Country(countryCode = "jp", available = true)
private val GERMANY = Country(countryCode = "de", available = true)
private val LOCATIONS = listOf(Recommended, GERMANY, JAPAN)

@RunWith(AndroidJUnit4::class)
class IPProtectionLocationsScreenTest {
    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `GIVEN the proxy is activating WHEN rendering the screen THEN the locations cannot be selected`() {
        val selections = mutableListOf<Location>()

        setScreen(selectedLocation = JAPAN, isActivating = true) { selections.add(it) }

        composeTestRule.onNodeWithText(JAPAN.displayName(LOCALE)).assertHasNoClickAction()
        composeTestRule.onNodeWithText(GERMANY.displayName(LOCALE)).assertHasNoClickAction().performClick()
        composeTestRule
            .onNodeWithText(testContext.getString(R.string.ip_protection_location_recommended_label))
            .assertHasNoClickAction()

        assertEquals(emptyList<Location>(), selections)
    }

    @Test
    fun `GIVEN the proxy is not activating WHEN rendering the screen THEN the locations can be selected`() {
        val selections = mutableListOf<Location>()

        setScreen(selectedLocation = JAPAN, isActivating = false) { selections.add(it) }

        composeTestRule.onNodeWithText(GERMANY.displayName(LOCALE)).assertHasClickAction().performClick()

        assertEquals(listOf<Location>(GERMANY), selections)
    }

    private fun setScreen(
        selectedLocation: Location,
        isActivating: Boolean,
        onLocationSelected: (Location) -> Unit = {},
    ) {
        composeTestRule.setContent {
            FirefoxTheme(theme = Theme.Light) {
                IPProtectionLocationsScreen(
                    selectedLocation = selectedLocation,
                    locations = LOCATIONS,
                    snackbarHostState = SnackbarHostState(),
                    isActivating = isActivating,
                    onNavigateBack = {},
                    onLocationSelected = onLocationSelected,
                )
            }
        }
    }
}
