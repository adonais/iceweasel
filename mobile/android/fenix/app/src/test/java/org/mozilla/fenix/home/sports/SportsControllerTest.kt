/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import androidx.navigation.NavController
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.browser.state.store.BrowserStore
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.mozilla.fenix.utils.Settings
import java.util.Locale

class SportsControllerTest {

    private val appStore: AppStore = mockk(relaxed = true)
    private val settings: Settings = mockk(relaxed = true)
    private val navController: NavController = mockk(relaxed = true)
    private val fenixBrowserUseCases: FenixBrowserUseCases = mockk(relaxed = true)

    private lateinit var browserStore: BrowserStore

    private lateinit var controller: SportsController

    private val originalLocale: Locale = Locale.getDefault()

    @Before
    fun setup() {
        Locale.setDefault(Locale.ENGLISH)
        browserStore = BrowserStore()
        every { appStore.state } returns AppState()

        controller = DefaultSportsController(
            appStore = appStore,
            browserStore = browserStore,
            settings = settings,
            navController = navController,
            fenixBrowserUseCases = fenixBrowserUseCases,
        )
    }

    @Test
    fun `GIVEN a set of country codes WHEN countries are selected THEN the selection is persisted and the action is dispatched`() {
        val countryCodes = setOf("USA", "JPN", "BRA")

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
    }

    @Test
    fun `GIVEN an empty set WHEN countries are selected THEN the selection is cleared and the action is dispatched`() {
        val countryCodes = emptySet<String>()

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
    }

    @Test
    fun `GIVEN a single country WHEN countries are selected THEN the selection is persisted and the action is dispatched`() {
        val countryCodes = setOf("USA")

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
    }

    @Test
    fun `WHEN the follow team flow is skipped THEN the preference is persisted and the action is dispatched`() {
        controller.handleSkippedFollowTeam()

        verify {
            settings.hasSkippedSportsFollowTeam = true
            appStore.dispatch(AppAction.SportsWidgetAction.FollowTeamSkipped)
        }
    }

    @Test
    fun `WHEN the sports widget is dismissed THEN the visibility preference is set to false and the action is dispatched`() {
        controller.handleSportsWidgetDismissed()

        verify {
            settings.showHomepageSportsWidget = false
            appStore.dispatch(AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false))
        }
    }

    @Test
    fun `WHEN the countdown widget is dismissed THEN the visibility preference is set to false and the action is dispatched`() {
        controller.handleCountdownWidgetDismissed()

        verify {
            settings.showHomepageCountdownWidget = false
            appStore.dispatch(AppAction.SportsWidgetAction.CountdownVisibilityChanged(isCountdownVisible = false))
        }
    }

    @Test
    fun `WHEN the get custom wallpaper menu item is clicked THEN the Wallpaper Settings fragment is opened`() {
        controller.handleOnGetCustomWallpaperClicked()

        verify {
            navController.navigate(R.id.wallpaperSettingsFragment)
        }
    }

    @Test
    fun `GIVEN valid ISO3 region codes WHEN a match is clicked THEN the browser is opened and a search is performed with the localized country names`() {
        controller.handleMatchClicked(homeTeam = "USA", awayTeam = "FRA")

        verify {
            navController.navigate(R.id.browserFragment)
            fenixBrowserUseCases.loadUrlOrSearch(
                searchTermOrURL = "United States vs France",
                newTab = true,
                private = false,
                searchEngine = any(),
            )
        }
    }

    @Test
    fun `GIVEN an unknown region code WHEN a match is clicked THEN the browser is opened and the original code is used as the fallback in the search term`() {
        controller.handleMatchClicked(homeTeam = "ZZZ", awayTeam = "FRA")

        verify {
            navController.navigate(R.id.browserFragment)
            fenixBrowserUseCases.loadUrlOrSearch(
                searchTermOrURL = "ZZZ vs France",
                newTab = true,
                private = false,
                searchEngine = any(),
            )
        }
    }

    @Test
    fun `GIVEN a malformed region code WHEN a match is clicked THEN the browser is opened and the original code is used as the fallback in the search term`() {
        controller.handleMatchClicked(homeTeam = "USA", awayTeam = "!!")

        verify {
            navController.navigate(R.id.browserFragment)
            fenixBrowserUseCases.loadUrlOrSearch(
                searchTermOrURL = "United States vs !!",
                newTab = true,
                private = false,
                searchEngine = any(),
            )
        }
    }

    @Test
    fun `GIVEN a non-English default locale WHEN a match is clicked THEN the search term uses country names localized to that locale`() {
        Locale.setDefault(Locale.FRENCH)

        controller.handleMatchClicked(homeTeam = "USA", awayTeam = "FRA")

        verify {
            navController.navigate(R.id.browserFragment)
            fenixBrowserUseCases.loadUrlOrSearch(
                searchTermOrURL = "États-Unis vs France",
                newTab = true,
                private = false,
                searchEngine = any(),
            )
        }
    }

    @After
    fun tearDown() {
        Locale.setDefault(originalLocale)
    }
}
