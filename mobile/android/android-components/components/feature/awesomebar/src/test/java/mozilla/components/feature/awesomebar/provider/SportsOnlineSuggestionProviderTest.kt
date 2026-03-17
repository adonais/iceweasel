/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.awesomebar.provider

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionDate
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionStatus
import mozilla.components.concept.awesomebar.optimizedsuggestions.SportSuggestionStatusType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

/**
 * Tests for [SportsOnlineSuggestionProvider].
 *
 * Note: these tests use virtual time provided by kotlinx.coroutines.test.runTest so that the internal
 * [kotlinx.coroutines.delay(ARTIFICIAL_DELAY)] does not slow the tests.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SportsOnlineSuggestionProviderTest {
    private lateinit var fakeDataSource: FakeSportsSuggestionDataSource
    private lateinit var provider: SportsOnlineSuggestionProvider

    @Before
    fun setUp() {
        fakeDataSource = FakeSportsSuggestionDataSource(
            results = listOf(
                sampleSportItem(),
            ),
        )

        provider = SportsOnlineSuggestionProvider(
            dataSource = fakeDataSource,
            suggestionsHeader = null,
            maxNumberOfSuggestions = DEFAULT_SPORT_SUGGESTION_LIMIT,
        )
    }

    @Test
    fun `returns empty list when text is empty and does not call data source`() = runTest {
        val results = provider.onInputChanged("")
        assertTrue(results.isEmpty())
        assertTrue(fakeDataSource.calls.isEmpty())
    }

    @Test
    fun `fetches and returns suggestions for any non-blank text`() = runTest {
        val deferred = async { provider.onInputChanged("test") }

        advanceTimeBy(ARTIFICIAL_DELAY)

        val results = deferred.await()
        assertTrue(results.isNotEmpty())

        assertEquals(listOf("test"), fakeDataSource.calls)

        val suggestion = results.single()
        assertEquals("NHL", suggestion.sport)
        assertEquals(provider, suggestion.provider)
    }

    @Test
    fun `respects maxNumberOfSuggestions`() = runTest {
        val manyResults = listOf(
            sampleSportItem(query = "a sport", sport = "A"),
            sampleSportItem(query = "b sport", sport = "B"),
            sampleSportItem(query = "c sport", sport = "C"),
        )

        val localDataSource = FakeSportsSuggestionDataSource(results = manyResults)

        val limitedProvider = SportsOnlineSuggestionProvider(
            dataSource = localDataSource,
            suggestionsHeader = null,
            maxNumberOfSuggestions = 1,
        )

        val deferred = async { limitedProvider.onInputChanged("sport") }
        advanceTimeBy(ARTIFICIAL_DELAY)
        val results = deferred.await()

        assertEquals(1, results.size)
    }

    @Test
    fun `id is stable per instance`() = runTest {
        val p = SportsOnlineSuggestionProvider(
            dataSource = FakeSportsSuggestionDataSource(results = listOf(sampleSportItem())),
            suggestionsHeader = null,
            maxNumberOfSuggestions = 1,
        )

        val id1 = p.id
        val deferred = async { p.onInputChanged("sport") }
        advanceTimeBy(ARTIFICIAL_DELAY)
        deferred.await()
        val id2 = p.id

        assertEquals(id1, id2)
    }

    @Test
    fun `cancellation before delay prevents data source call`() = runTest {
        val localDataSource = FakeSportsSuggestionDataSource(results = listOf(sampleSportItem()))
        val cancellableProvider = SportsOnlineSuggestionProvider(
            dataSource = localDataSource,
            suggestionsHeader = null,
            maxNumberOfSuggestions = 1,
        )

        val job = async { cancellableProvider.onInputChanged("sport") }

        job.cancel(CancellationException("test-cancel"))

        advanceTimeBy(ARTIFICIAL_DELAY)

        try {
            job.await()
            // If we get here, cancellation didn't happen as expected — fail the test.
            throw AssertionError("Expected cancellation to propagate")
        } catch (_: CancellationException) {
            // expected
        }

        assertTrue(localDataSource.calls.isEmpty())
    }

    // --- parseDate tests ---

    @Test
    fun `parseDate returns Today when date is today`() {
        val timeZone = ZoneId.of("UTC")
        val today = LocalDate.now(timeZone)
        val isoDate = "${today}T12:00:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        assertEquals(SportSuggestionDate.Today, result)
    }

    @Test
    fun `parseDate returns Tomorrow with formatted time when date is tomorrow`() {
        val timeZone = ZoneId.of("UTC")
        val tomorrow = LocalDate.now(timeZone).plusDays(1)
        val isoDate = "${tomorrow}T17:00:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        assertTrue(result is SportSuggestionDate.Tomorrow)
        assertEquals("5:00 PM", (result as SportSuggestionDate.Tomorrow).time)
    }

    @Test
    fun `parseDate returns 12-hour formatted time for US`() {
        val timeZone = ZoneId.of("UTC")
        val tomorrow = LocalDate.now(timeZone).plusDays(1)
        val isoDate = "${tomorrow}T18:07:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        assertEquals("6:07 PM", (result as SportSuggestionDate.Tomorrow).time)
    }

    @Test
    fun `parseDate returns 24-hour formatted time for France`() {
        val timeZone = ZoneId.of("UTC")
        val tomorrow = LocalDate.now(timeZone).plusDays(1)
        val isoDate = "${tomorrow}T18:07:00+00:00"

        val result = provider.parseDate(isoDate, Locale.FRANCE, timeZone)

        assertEquals("18:07", (result as SportSuggestionDate.Tomorrow).time)
    }

    @Test
    fun `parseDate returns General with formatted date for other dates`() {
        val timeZone = ZoneId.of("UTC")
        val isoDate = "2025-10-29T00:00:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        assertTrue(result is SportSuggestionDate.General)
        assertEquals("29 Oct 2025", (result as SportSuggestionDate.General).date)
    }

    @Test
    fun `parseDate returns null for invalid date string`() {
        val result = provider.parseDate("not-a-date", Locale.US, ZoneId.of("UTC"))

        assertNull(result)
    }

    @Test
    fun `parseDate converts timezone correctly for EST`() {
        // 05:00 UTC is 00:00 EST (UTC-5), so it should still be "today" in EST
        val timeZone = ZoneId.of("UTC-5")
        val today = LocalDate.now(timeZone)
        val isoDate = "${today}T05:00:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        // 05:00 UTC = 00:00 EST, which is still "today" in EST
        assertEquals(SportSuggestionDate.Today, result)
    }

    @Test
    fun `parseDate converts timezone correctly for JST`() {
        // 15:00 UTC is 00:00 JST (UTC+9) the next day, so today in UTC is tomorrow in JST
        val timeZone = ZoneId.of("UTC+9")
        val tomorrow = LocalDate.now(timeZone)
        val isoDate = "${tomorrow}T15:00:00+00:00"

        val result = provider.parseDate(isoDate, Locale.US, timeZone)

        // 15:00 UTC = 00:00 JST next day, which is "tomorrow" in JST
        assertTrue(result is SportSuggestionDate.Tomorrow)
    }

    // --- parseStatus tests ---

    @Test
    fun `parseStatus returns Scheduled for Scheduled`() {
        assertEquals(SportSuggestionStatus.Scheduled, provider.parseStatus("Scheduled"))
    }

    @Test
    fun `parseStatus returns Delayed for Delayed`() {
        assertEquals(SportSuggestionStatus.Delayed, provider.parseStatus("Delayed"))
    }

    @Test
    fun `parseStatus returns Postponed for Postponed`() {
        assertEquals(SportSuggestionStatus.Postponed, provider.parseStatus("Postponed"))
    }

    @Test
    fun `parseStatus returns InProgress for In Progress`() {
        assertEquals(SportSuggestionStatus.InProgress, provider.parseStatus("In Progress"))
    }

    @Test
    fun `parseStatus returns Suspended for Suspended`() {
        assertEquals(SportSuggestionStatus.Suspended, provider.parseStatus("Suspended"))
    }

    @Test
    fun `parseStatus returns Canceled for Canceled`() {
        assertEquals(SportSuggestionStatus.Canceled, provider.parseStatus("Canceled"))
    }

    @Test
    fun `parseStatus returns Final for Final`() {
        assertEquals(SportSuggestionStatus.Final, provider.parseStatus("Final"))
    }

    @Test
    fun `parseStatus returns Final for Final - Over Time`() {
        assertEquals(SportSuggestionStatus.FinalOverTime, provider.parseStatus("Final - Over Time"))
    }

    @Test
    fun `parseStatus returns FinalShootOut for Final - Shoot Out`() {
        assertEquals(SportSuggestionStatus.FinalShootOut, provider.parseStatus("Final - Shoot Out"))
    }

    @Test
    fun `parseStatus returns Forfeit for Forfeit`() {
        assertEquals(SportSuggestionStatus.Forfeit, provider.parseStatus("Forfeit"))
    }

    @Test
    fun `parseStatus returns NotNecessary for Not Necessary`() {
        assertEquals(SportSuggestionStatus.NotNecessary, provider.parseStatus("Not Necessary"))
    }

    @Test
    fun `parseStatus returns Unknown for unrecognized status`() {
        assertEquals(SportSuggestionStatus.Unknown, provider.parseStatus("SomeOtherStatus"))
    }

    // --- parseStatusType tests ---

    @Test
    fun `parseStatusType returns PAST for past`() {
        assertEquals(SportSuggestionStatusType.PAST, provider.parseStatusType("past"))
    }

    @Test
    fun `parseStatusType returns LIVE for live`() {
        assertEquals(SportSuggestionStatusType.LIVE, provider.parseStatusType("live"))
    }

    @Test
    fun `parseStatusType returns SCHEDULED for scheduled`() {
        assertEquals(SportSuggestionStatusType.SCHEDULED, provider.parseStatusType("scheduled"))
    }

    @Test
    fun `parseStatusType returns NONE for unrecognized type`() {
        assertEquals(SportSuggestionStatusType.NONE, provider.parseStatusType("unknown"))
    }

    // --- parseTeam tests ---

    @Test
    fun `parseTeam returns team with name and score`() {
        val team = AwesomeBar.SportItem.Team(
            key = "MIN",
            name = "Minnesota Wild",
            colors = listOf("0E4431"),
            score = 3,
        )

        val result = provider.parseTeam(team)

        assertEquals("Minnesota Wild", result?.name)
        assertEquals(3, result?.score)
    }

    @Test
    fun `parseTeam returns null for blank team name`() {
        val team = AwesomeBar.SportItem.Team(
            key = "MIN",
            name = "   ",
            colors = listOf("0E4431"),
            score = 3,
        )

        assertNull(provider.parseTeam(team))
    }
}

/**
 * Simple fake data source used for unit tests.
 * Records calls and returns the specified results.
 */
private class FakeSportsSuggestionDataSource(
    private val results: List<AwesomeBar.SportItem> = emptyList(),
) : AwesomeBar.SportsSuggestionDataSource {
    val calls = mutableListOf<String>()

    override suspend fun fetch(query: String): List<AwesomeBar.SportItem> {
        calls += query
        return results
    }
}

/** Convenience factory for creating sample [AwesomeBar.SportItem] objects for tests. */
private fun sampleSportItem(
    query: String = "NHL Winnipeg Jets at Minnesota Wild 28 Oct 2025",
    sport: String = "NHL",
    date: String = "2025-10-29T00:00:00+00:00",
    status: String = "Final - Over Time",
    statusType: String = "past",
    homeTeam: AwesomeBar.SportItem.Team = sampleHomeTeam,
    awayTeam: AwesomeBar.SportItem.Team = sampleAwayTeam,
) = AwesomeBar.SportItem(
    query = query,
    sport = sport,
    date = date,
    status = status,
    statusType = statusType,
    homeTeam = homeTeam,
    awayTeam = awayTeam,
)

private val sampleHomeTeam = AwesomeBar.SportItem.Team(
    key = "MIN",
    name = "Minnesota Wild",
    colors = listOf("0E4431", "AC1A2E", "EAAA00", "DDC9A3"),
    score = 3,
)
private val sampleAwayTeam = AwesomeBar.SportItem.Team(
    key = "WPG",
    name = "Winnipeg Jets",
    colors = listOf("041E42", "004A98", "A2AAAD", "A6192E"),
    score = 4,
)
