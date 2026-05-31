/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.sports

import androidx.navigation.NavController
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.state.store.BrowserStore
import org.mozilla.fenix.GleanMetrics.WorldCup
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.mozilla.fenix.ext.openToBrowser
import org.mozilla.fenix.utils.Settings
import java.util.IllformedLocaleException
import java.util.Locale
import java.util.MissingResourceException

/**
 * Controller for handling sports widget interactions on the homepage.
 */
interface SportsController {

    /**
     * Handles the user selecting countries in the sports widget country selector.
     *
     * @param countryCodes Set of country codes for the selected countries.
     */
    fun handleCountriesSelected(countryCodes: Set<String>)

    /**
     * Handles the user skipping the "Follow your team" card.
     */
    fun handleSkippedFollowTeam()

    /**
     * Handles the user dismissing the sports widget from the homepage.
     */
    fun handleSportsWidgetDismissed()

    /**
     * Handles the user dismissing the countdown widget from the homepage.
     */
    fun handleCountdownWidgetDismissed()

    /**
     * Handles the user clicking the "View Schedule" button.
     */
    fun handleViewScheduleClicked()

    /**
     * Handles the user tapping the reload button to manually refresh match data.
     */
    fun handleRefreshClicked(source: LiveMatchRefreshSource)

    /**
     * Handles the user clicking the "Get custom wallpaper" menu item.
     */
    fun handleOnGetCustomWallpaperClicked()

    /**
     * Called when the user clicks a Match.
     */
    fun handleMatchClicked(homeTeam: String, awayTeam: String)

    /**
     * Called when the sports widget is displayed.
     */
    fun handleSportsWidgetShown()

    /**
     * Called when the country selector bottom sheet is displayed.
     */
    fun handleCountrySelectorShown(source: CountrySelectorSource)
}

/**
 * Default implementation of [SportsController] that dispatches actions to the [AppStore].
 *
 * @param appStore The [AppStore] to dispatch actions to.
 * @param browserStore [BrowserStore] to sync from.
 * @param settings [Settings] used to persist sports widget preferences.
 * @param navController [NavController] used to navigate to a new browser fragment.
 * @param fenixBrowserUseCases [FenixBrowserUseCases] used to load the sports schedule.
 */
class DefaultSportsController(
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val settings: Settings,
    private val navController: NavController,
    private val fenixBrowserUseCases: FenixBrowserUseCases,
) : SportsController {

    override fun handleCountriesSelected(countryCodes: Set<String>) {
        settings.sportsSelectedCountries = countryCodes
        appStore.dispatch(AppAction.SportsWidgetAction.CountriesSelected(countryCodes = countryCodes))
        if (countryCodes.isNotEmpty()) {
            WorldCup.countrySelected.record()
        }
    }

    override fun handleSkippedFollowTeam() {
        settings.hasSkippedSportsFollowTeam = true
        appStore.dispatch(AppAction.SportsWidgetAction.FollowTeamSkipped)
        WorldCup.skipFollowTeamClicked.record()
    }

    override fun handleSportsWidgetDismissed() {
        settings.showHomepageSportsWidget = false
        appStore.dispatch(AppAction.SportsWidgetAction.VisibilityChanged(isVisible = false))
        WorldCup.sportsWidgetDismissed.record()
    }

    override fun handleCountdownWidgetDismissed() {
        settings.showHomepageCountdownWidget = false
        appStore.dispatch(AppAction.SportsWidgetAction.CountdownVisibilityChanged(isCountdownVisible = false))
        WorldCup.countdownCrossActionClicked.record()
    }

    override fun handleRefreshClicked(source: LiveMatchRefreshSource) {
        appStore.dispatch(AppAction.SportsWidgetAction.FetchMatches)
        WorldCup.refreshClicked.record(
            extra = WorldCup.RefreshClickedExtra(source = source.value),
        )
    }

    override fun handleViewScheduleClicked() {
        navController.openToBrowser()

        fenixBrowserUseCases.loadUrlOrSearch(
            searchTermOrURL = SPORT_SCHEDULE_URL,
            private = appStore.state.mode.isPrivate,
            newTab = true,
        )
        WorldCup.viewScheduleOnCountdownClicked.record()
    }

    override fun handleOnGetCustomWallpaperClicked() {
        navController.navigate(R.id.wallpaperSettingsFragment)
        WorldCup.getCustomWallpaperClicked.record()
    }

    override fun handleMatchClicked(homeTeam: String, awayTeam: String) {
        navController.openToBrowser()

        fenixBrowserUseCases.loadUrlOrSearch(
            searchTermOrURL = "${localizedCountryName(homeTeam)} vs ${localizedCountryName(awayTeam)}",
            newTab = true,
            private = appStore.state.mode.isPrivate,
            searchEngine = appStore.state.searchState.selectedSearchEngine?.searchEngine
                ?: browserStore.state.search.selectedOrDefaultSearchEngine,
        )

        WorldCup.matchClicked.record()
    }

    override fun handleSportsWidgetShown() {
        WorldCup.sportsWidgetDisplayed.record()
    }

    override fun handleCountrySelectorShown(source: CountrySelectorSource) {
        WorldCup.countrySelectorDisplayed.record(extra = WorldCup.CountrySelectorDisplayedExtra(source = source.value))
    }

    /**
     * Resolves an ISO 3166-1 alpha-3 region code (as stored on [Team.region]) to a country name
     * localized to the user's current [Locale]. Falls back to the original code when no match
     * is found.
     */
    private fun localizedCountryName(iso3Code: String): String {
        return try {
            val iso2Code = Locale.getISOCountries().firstOrNull {
                Locale.Builder().setRegion(it).build().isO3Country.equals(iso3Code, ignoreCase = true)
            } ?: return iso3Code
            Locale.Builder().setRegion(iso2Code).build().getDisplayCountry(Locale.getDefault())
        } catch (e: IllformedLocaleException) {
            iso3Code
        } catch (e: MissingResourceException) {
            iso3Code
        }
    }

    companion object {
        const val SPORT_SCHEDULE_URL =
            "https://www.fifa.com/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"
    }
}
