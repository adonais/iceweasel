/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.feature.ipprotection.store.state.AccountState
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.Country
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.Location
import mozilla.components.feature.ipprotection.store.state.LocationState
import mozilla.components.feature.ipprotection.store.state.Recommended
import mozilla.components.lib.state.Middleware
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test

@OptIn(mozilla.components.ExperimentalAndroidComponentsApi::class)
class IPProtectionLocationMiddlewareTest {

    private lateinit var fakeRepository: IPProtectionLocationRepository
    private lateinit var middleware: IPProtectionLocationMiddleware
    private val scope = TestScope(StandardTestDispatcher())

    @Before
    fun setUp() {
        fakeRepository = FakeIPProtectionLocationRepository()
        middleware = IPProtectionLocationMiddleware(fakeRepository, scope)
    }

    @Test
    fun `WHEN location changes THEN the selected location code is saved in the repository`() = scope.runTest {
        listOf(
                Recommended,
                Country(countryCode = "JA", available = true),
                Country(countryCode = "CA", available = true),
            )
            .forEach { location ->
                val fakeRepository = FakeIPProtectionLocationRepository()
                val store =
                    buildStore(
                        middleware =
                            listOf(
                                IPProtectionLocationMiddleware(
                                    repository = fakeRepository,
                                    coroutineScope = scope,
                                )
                            )
                    )

                assertEquals(null, fakeRepository.getSelectedLocationCode())
                assertEquals(null, store.state.locationState.selectedLocation.countryCode)

                store.dispatch(IPProtectionAction.LocationChanged(location))
                testScheduler.advanceUntilIdle()

                assertEquals(location.countryCode, fakeRepository.getSelectedLocationCode())
                assertEquals(location.countryCode, store.state.locationState.selectedLocation.countryCode)
            }
    }

    // simulates the start of the app when a country list update contains the previously cached code
    @Test
    fun `GIVEN a country list update contains a country with a code that matches the cached code WHEN country list updates THEN selected location equals the matching country`() =
        scope.runTest {
            val cachedCode = "JA"
            val store = buildStore(locationState = LocationState(), middleware = listOf(middleware))
            fakeRepository.setSelectedLocationCode(cachedCode)

            assertFalse(cachedCode == store.state.locationState.selectedLocation.countryCode)

            store.dispatch(
                IPProtectionAction.CountryListChanged(
                    countries =
                        listOf(
                            IPProtectionHandler.Country(code = cachedCode, available = true),
                            IPProtectionHandler.Country(code = "CA", available = true),
                            IPProtectionHandler.Country(code = "GB", available = true),
                            IPProtectionHandler.Country(code = "FR", available = true),
                        )
                )
            )
            testScheduler.advanceUntilIdle()

            assertEquals(cachedCode, store.state.locationState.selectedLocation.countryCode)
        }

    // simulates the start of the app when a country list does not contain the previously cached code
    @Test
    fun `GIVEN default location state AND a country list update does not contain the selected country WHEN country list updates THEN cache is reset and the selected location is Recommended`() =
        scope.runTest {
            val cachedCode = "JA"
            val store = buildStore(locationState = LocationState(), middleware = listOf(middleware))
            fakeRepository.setSelectedLocationCode(cachedCode)

            store.dispatch(
                IPProtectionAction.CountryListChanged(
                    countries =
                        listOf(
                            IPProtectionHandler.Country(code = "FN", available = true),
                            IPProtectionHandler.Country(code = "CA", available = true),
                            IPProtectionHandler.Country(code = "GB", available = true),
                            IPProtectionHandler.Country(code = "FR", available = true),
                        )
                )
            )

            testScheduler.advanceUntilIdle()

            assertEquals(Recommended, store.state.locationState.selectedLocation)
            assertEquals(null, fakeRepository.getSelectedLocationCode())
        }

    // simulates a country list update after the app has been running for a bit
    @Test
    fun `GIVEN populated location state AND a country list update does not contain the selected country WHEN country list updates THEN cache is reset and selected country resets to default`() =
        scope.runTest {
            val cachedCode = "JA"
            val selectedCountry = Country(countryCode = cachedCode, available = true)
            val store =
                buildStore(
                    selectedLocation = selectedCountry,
                    locations =
                        listOf(
                            selectedCountry,
                            Country(countryCode = "CA", available = true),
                            Country(countryCode = "GB", available = true),
                            Country(countryCode = "FR", available = true),
                        ),
                    middleware = listOf(middleware),
                )
            fakeRepository.setSelectedLocationCode(cachedCode)

            assertEquals(selectedCountry, store.state.locationState.selectedLocation)
            assertEquals(cachedCode, fakeRepository.getSelectedLocationCode())

            store.dispatch(
                IPProtectionAction.CountryListChanged(
                    countries =
                        listOf(
                            IPProtectionHandler.Country(code = "CA", available = true),
                            IPProtectionHandler.Country(code = "GB", available = true),
                            IPProtectionHandler.Country(code = "FR", available = true),
                        )
                )
            )
            testScheduler.advanceUntilIdle()

            assertEquals(Recommended, store.state.locationState.selectedLocation)
            assertEquals(null, fakeRepository.getSelectedLocationCode())
        }

    // simulates a country list update after the app has been running for a bit
    @Test
    fun `GIVEN populated location state AND the previously selected country turns unavailable WHEN country list updates THEN cache is reset and selected country resets to default`() =
        scope.runTest {
            val cachedCode = "JA"
            val selectedCountry = Country(countryCode = cachedCode, available = true)
            val store =
                buildStore(
                    selectedLocation = selectedCountry,
                    locations =
                        listOf(
                            selectedCountry,
                            Country(countryCode = "CA", available = true),
                            Country(countryCode = "GB", available = true),
                            Country(countryCode = "FR", available = true),
                        ),
                    middleware = listOf(middleware),
                )
            fakeRepository.setSelectedLocationCode(cachedCode)

            assertEquals(selectedCountry, store.state.locationState.selectedLocation)
            assertEquals(cachedCode, fakeRepository.getSelectedLocationCode())

            store.dispatch(
                IPProtectionAction.CountryListChanged(
                    countries =
                        listOf(
                            IPProtectionHandler.Country(code = cachedCode, available = false),
                            IPProtectionHandler.Country(code = "CA", available = true),
                            IPProtectionHandler.Country(code = "GB", available = true),
                            IPProtectionHandler.Country(code = "FR", available = true),
                        )
                )
            )
            testScheduler.advanceUntilIdle()

            assertEquals(Recommended, store.state.locationState.selectedLocation)
            assertEquals(null, fakeRepository.getSelectedLocationCode())
        }

    // simulates the start of the app when a country list update contains the previously cached location but the
    // location is no longer available
    @Test
    fun `GIVEN default location state AND the previously selected country turns unavailable WHEN country list updates THEN cache is reset and the selected location remains Recommended`() =
        scope.runTest {
            val cachedCode = "JA"
            val store = buildStore(locationState = LocationState(), middleware = listOf(middleware))
            fakeRepository.setSelectedLocationCode(cachedCode)

            assertFalse(cachedCode == store.state.locationState.selectedLocation.countryCode)

            store.dispatch(
                IPProtectionAction.CountryListChanged(
                    countries =
                        listOf(
                            IPProtectionHandler.Country(code = cachedCode, available = false),
                            IPProtectionHandler.Country(code = "CA", available = true),
                            IPProtectionHandler.Country(code = "GB", available = true),
                            IPProtectionHandler.Country(code = "FR", available = true),
                        )
                )
            )
            testScheduler.advanceUntilIdle()

            assertEquals(Recommended, store.state.locationState.selectedLocation)
            assertEquals(null, fakeRepository.getSelectedLocationCode())
        }

    @Test
    fun `GIVEN a cached selected location WHEN a user logs out THEN the cache is cleared`() = scope.runTest {
        val cachedCode = "JA"
        val selectedCountry = Country(countryCode = cachedCode, available = true)
        val store =
            buildStore(
                accountState = AccountState(AccountStatus.EnrolledAndEntitled),
                selectedLocation = selectedCountry,
                locations =
                    listOf(
                        selectedCountry,
                        Country(countryCode = "CA", available = true),
                        Country(countryCode = "GB", available = true),
                        Country(countryCode = "FR", available = true),
                    ),
                middleware = listOf(middleware),
            )
        fakeRepository.setSelectedLocationCode(cachedCode)

        assertEquals(selectedCountry, store.state.locationState.selectedLocation)
        assertEquals(cachedCode, fakeRepository.getSelectedLocationCode())

        store.dispatch(InternalAction.AccountManagerStateChanged(status = AccountStatus.NoAccount))
        testScheduler.advanceUntilIdle()

        assertEquals(null, fakeRepository.getSelectedLocationCode())
    }

    private fun buildStore(
        selectedLocation: Location = Recommended,
        locations: List<Location> = listOf(Recommended),
        locationState: LocationState =
            LocationState(
                selectedLocation = selectedLocation,
                locations = locations,
            ),
        accountState: AccountState = AccountState(),
        middleware: List<Middleware<IPProtectionState, IPProtectionAction>> = emptyList(),
    ) =
        IPProtectionStore(
            initialState =
                IPProtectionState(
                    locationState = locationState,
                    accountState = accountState,
                ),
            middleware = middleware,
        )

    private class FakeIPProtectionLocationRepository : IPProtectionLocationRepository {
        private var selectedLocationCode: String? = null

        override suspend fun getSelectedLocationCode(): String? {
            return selectedLocationCode
        }

        override suspend fun setSelectedLocationCode(code: String?) {
            selectedLocationCode = code
        }
    }
}
