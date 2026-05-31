/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import androidx.navigation.NavController
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.WorldCup
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
class SportsControllerTest {
    @get:Rule
    val gleanTestRule = FenixGleanTestRule(testContext)

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
    fun `GIVEN a set of country codes WHEN countries are selected THEN the selection is persisted, action is dispatched and telemetry is recorded`() {
        val countryCodes = setOf("USA", "JPN", "BRA")
        assertNull(WorldCup.countrySelected.testGetValue())

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
        val snapshot = WorldCup.countrySelected.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selected", snapshot.single().name)
    }

    @Test
    fun `GIVEN an empty set WHEN countries are selected THEN the selection is cleared, action is dispatched and telemetry is not recorded`() {
        val countryCodes = emptySet<String>()
        assertNull(WorldCup.countrySelected.testGetValue())

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
        assertNull(WorldCup.countrySelected.testGetValue())
    }

    @Test
    fun `GIVEN a single country WHEN countries are selected THEN the selection is persisted, action is dispatched and telemetry is recorded`() {
        val countryCodes = setOf("USA")
        assertNull(WorldCup.countrySelected.testGetValue())

        controller.handleCountriesSelected(countryCodes)

        verify {
            settings.sportsSelectedCountries = countryCodes
            appStore.dispatch(
                AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes),
            )
        }
        val snapshot = WorldCup.countrySelected.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selected", snapshot.single().name)
    }

    @Test
    fun `WHEN the follow team flow is skipped THEN the preference is persisted, action is dispatched and telemetry is recorded`() {
        assertNull(WorldCup.skipFollowTeamClicked.testGetValue())

        controller.handleSkippedFollowTeam()

        verify {
            settings.hasSkippedSportsFollowTeam = true
            appStore.dispatch(AppAction.SportsWidgetAction.FollowTeamSkipped)
        }
        val snapshot = WorldCup.skipFollowTeamClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("skip_follow_team_clicked", snapshot.single().name)
    }

    @Test
    fun `WHEN the sports widget is dismissed THEN the visibility preference is set to false, action is dispatched and telemetry is recorded`() {
        assertNull(WorldCup.sportsWidgetDismissed.testGetValue())

        controller.handleSportsWidgetDismissed()

        verify {
            settings.showHomepageSportsWidget = false
            appStore.dispatch(AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false))
        }
        val snapshot = WorldCup.sportsWidgetDismissed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("sports_widget_dismissed", snapshot.single().name)
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
    fun `GIVEN the live match header source WHEN refresh is clicked THEN matches are fetched and telemetry is recorded with the source`() {
        assertNull(WorldCup.refreshClicked.testGetValue())

        controller.handleRefreshClicked(LiveMatchRefreshSource.LIVE_MATCH_HEADER)

        verify {
            appStore.dispatch(AppAction.SportsWidgetAction.FetchMatches)
        }
        val snapshot = WorldCup.refreshClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("refresh_clicked", snapshot.single().name)
        assertEquals(
            LiveMatchRefreshSource.LIVE_MATCH_HEADER.value,
            snapshot.single().extra!!["source"],
        )
    }

    @Test
    fun `GIVEN the live match error button source WHEN refresh is clicked THEN matches are fetched and telemetry is recorded with the source`() {
        assertNull(WorldCup.refreshClicked.testGetValue())

        controller.handleRefreshClicked(LiveMatchRefreshSource.LIVE_MATCH_ERROR_BUTTON)

        verify {
            appStore.dispatch(AppAction.SportsWidgetAction.FetchMatches)
        }
        val snapshot = WorldCup.refreshClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("refresh_clicked", snapshot.single().name)
        assertEquals(
            LiveMatchRefreshSource.LIVE_MATCH_ERROR_BUTTON.value,
            snapshot.single().extra!!["source"],
        )
    }

    @Test
    fun `WHEN the get custom wallpaper menu item is clicked THEN the Wallpaper Settings fragment is opened and telemetry is recorded`() {
        assertNull(WorldCup.getCustomWallpaperClicked.testGetValue())

        controller.handleOnGetCustomWallpaperClicked()

        verify {
            navController.navigate(R.id.wallpaperSettingsFragment)
        }
        val snapshot = WorldCup.getCustomWallpaperClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("get_custom_wallpaper_clicked", snapshot.single().name)
    }

    @Test
    fun `GIVEN valid ISO3 region codes WHEN a match is clicked THEN the browser is opened, a search is performed with the localized country names and telemetry is recorded`() {
        assertNull(WorldCup.matchClicked.testGetValue())

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
        val snapshot = WorldCup.matchClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("match_clicked", snapshot.single().name)
    }

    @Test
    fun `GIVEN an unknown region code WHEN a match is clicked THEN the browser is opened, the original code is used as the fallback in the search term and telemetry is recorded`() {
        assertNull(WorldCup.matchClicked.testGetValue())

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
        val snapshot = WorldCup.matchClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("match_clicked", snapshot.single().name)
    }

    @Test
    fun `GIVEN a malformed region code WHEN a match is clicked THEN the browser is opened, the original code is used as the fallback in the search term and telemetry is recorded`() {
        assertNull(WorldCup.matchClicked.testGetValue())

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
        val snapshot = WorldCup.matchClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("match_clicked", snapshot.single().name)
    }

    @Test
    fun `GIVEN a non-English default locale WHEN a match is clicked THEN the search term uses country names localized to that locale and telemetry is recorded`() {
        Locale.setDefault(Locale.FRENCH)
        assertNull(WorldCup.matchClicked.testGetValue())

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
        val snapshot = WorldCup.matchClicked.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("match_clicked", snapshot.single().name)
    }

    @Test
    fun `WHEN the sports widget is shown THEN telemetry is recorded`() {
        assertNull(WorldCup.sportsWidgetDisplayed.testGetValue())

        controller.handleSportsWidgetShown()

        val snapshot = WorldCup.sportsWidgetDisplayed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("sports_widget_displayed", snapshot.single().name)
    }

    @Test
    fun `GIVEN the sports logo source WHEN the country selector is shown THEN telemetry is recorded with the source`() {
        assertNull(WorldCup.countrySelectorDisplayed.testGetValue())

        controller.handleCountrySelectorShown(CountrySelectorSource.SPORTS_LOGO)

        val snapshot = WorldCup.countrySelectorDisplayed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selector_displayed", snapshot.single().name)
        assertEquals(
            CountrySelectorSource.SPORTS_LOGO.value,
            snapshot.single().extra!!["source"],
        )
    }

    @Test
    fun `GIVEN the sports widget menu source WHEN the country selector is shown THEN telemetry is recorded with the source`() {
        assertNull(WorldCup.countrySelectorDisplayed.testGetValue())

        controller.handleCountrySelectorShown(CountrySelectorSource.SPORTS_WIDGET_MENU)

        val snapshot = WorldCup.countrySelectorDisplayed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selector_displayed", snapshot.single().name)
        assertEquals(
            CountrySelectorSource.SPORTS_WIDGET_MENU.value,
            snapshot.single().extra!!["source"],
        )
    }

    @Test
    fun `GIVEN the countdown card follow team button source WHEN the country selector is shown THEN telemetry is recorded with the source`() {
        assertNull(WorldCup.countrySelectorDisplayed.testGetValue())

        controller.handleCountrySelectorShown(CountrySelectorSource.COUNTDOWN_CARD_FOLLOW_TEAM_BUTTON)

        val snapshot = WorldCup.countrySelectorDisplayed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selector_displayed", snapshot.single().name)
        assertEquals(
            CountrySelectorSource.COUNTDOWN_CARD_FOLLOW_TEAM_BUTTON.value,
            snapshot.single().extra!!["source"],
        )
    }

    @Test
    fun `GIVEN the keep tabs card follow team button source WHEN the country selector is shown THEN telemetry is recorded with the source`() {
        assertNull(WorldCup.countrySelectorDisplayed.testGetValue())

        controller.handleCountrySelectorShown(CountrySelectorSource.KEEP_TABS_CARD_FOLLOW_TEAM_BUTTON)

        val snapshot = WorldCup.countrySelectorDisplayed.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("country_selector_displayed", snapshot.single().name)
        assertEquals(
            CountrySelectorSource.KEEP_TABS_CARD_FOLLOW_TEAM_BUTTON.value,
            snapshot.single().extra!!["source"],
        )
    }

    @After
    fun tearDown() {
        Locale.setDefault(originalLocale)
    }
}
