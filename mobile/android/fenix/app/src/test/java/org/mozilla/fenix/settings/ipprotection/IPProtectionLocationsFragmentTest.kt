/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.ipprotection

import androidx.navigation.NavController
import io.mockk.mockk
import io.mockk.verify
import kotlin.test.assertEquals
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.IPProtectionStore
import mozilla.components.feature.ipprotection.store.state.Country
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.Location
import mozilla.components.feature.ipprotection.store.state.LocationState
import mozilla.components.feature.ipprotection.store.state.Recommended
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.MockkRetryTestRule
import org.robolectric.RobolectricTestRunner

private val GERMANY = Country(countryCode = "de", available = true)

@RunWith(RobolectricTestRunner::class)
class IPProtectionLocationsFragmentTest {

    @get:Rule val mockkRule = MockkRetryTestRule()

    private lateinit var fragment: IPProtectionLocationsFragment
    private lateinit var navController: NavController
    private val captureMiddleWare = CaptureActionsMiddleware<IPProtectionState, IPProtectionAction>()

    @Before
    fun setup() {
        fragment = IPProtectionLocationsFragment()
        navController = mockk(relaxed = true)
    }

    @Test
    fun `GIVEN the recommended location is selected WHEN a location is selected THEN the change is dispatched to the store`() {
        val store = storeWith(Recommended)

        fragment.handleSelectedLocation(GERMANY, store, navController)

        assertEquals(GERMANY, store.state.locationState.selectedLocation)
    }

    @Test
    fun `GIVEN the recommended location is selected WHEN a location is selected THEN the navigation pops back to the built in VPN settings screen`() {
        fragment.handleSelectedLocation(GERMANY, storeWith(Recommended), navController)

        verify { navController.popBackStack(R.id.ipProtectionFragment, false) }
    }

    @Test
    fun `GIVEN the tapped location is already selected WHEN it is selected again THEN the navigation pops back to the built in VPN settings screen`() {
        fragment.handleSelectedLocation(GERMANY, storeWith(GERMANY), navController)

        verify { navController.popBackStack(R.id.ipProtectionFragment, false) }
    }

    @Test
    fun `GIVEN the tapped location is already selected WHEN it is selected again THEN no location change is dispatched`() {
        fragment.handleSelectedLocation(GERMANY, storeWith(GERMANY), navController)

        captureMiddleWare.assertNotDispatched(IPProtectionAction.LocationChanged::class)
    }

    @OptIn(ExperimentalAndroidComponentsApi::class)
    private fun storeWith(selectedLocation: Location) =
        IPProtectionStore(
            initialState = IPProtectionState(locationState = LocationState(selectedLocation = selectedLocation)),
            middleware = listOf(captureMiddleWare),
        )
}
