/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.ext

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.Locale
import mozilla.appservices.merino.CuratedRecommendationLocale
import mozilla.appservices.merino.CuratedRecommendationsResponse
import mozilla.components.service.pocket.helpers.PocketTestResources
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MappersKtTest {
    @Test
    fun `GIVEN a ContentRecommendationEntity WHEN it is converted to be exposed to clients THEN a one to one mapping is made`() {
        val recommendation = PocketTestResources.contentRecommendationEntity

        val result = recommendation.toContentRecommendation()

        assertSame(recommendation.corpusItemId, result.corpusItemId)
        assertSame(recommendation.scheduledCorpusItemId, result.scheduledCorpusItemId)
        assertSame(recommendation.url, result.url)
        assertSame(recommendation.title, result.title)
        assertSame(recommendation.excerpt, result.excerpt)
        assertSame(recommendation.topic, result.topic)
        assertSame(recommendation.publisher, result.publisher)
        assertSame(recommendation.isTimeSensitive, result.isTimeSensitive)
        assertSame(recommendation.imageUrl, result.imageUrl)
        assertEquals(recommendation.tileId, result.tileId)
        assertEquals(recommendation.receivedRank, result.receivedRank)
        assertEquals(recommendation.recommendedAt, result.recommendedAt)
        assertEquals(recommendation.impressions, result.impressions)
    }

    @Test
    fun `GIVEN a ContentRecommendationItem WHEN it is converted to the database object type THEN a one to one mapping is made`() {
        val recommendation = PocketTestResources.contentRecommendationResponseItem1
        val recommendedAt = 100L
        val result = recommendation.toContentRecommendationEntity(recommendedAt = recommendedAt)

        assertSame(recommendation.corpusItemId, result.corpusItemId)
        assertSame(recommendation.scheduledCorpusItemId, result.scheduledCorpusItemId)
        assertSame(recommendation.url, result.url)
        assertSame(recommendation.title, result.title)
        assertSame(recommendation.excerpt, result.excerpt)
        assertSame(recommendation.topic, result.topic)
        assertSame(recommendation.publisher, result.publisher)
        assertSame(recommendation.isTimeSensitive, result.isTimeSensitive)
        assertSame(recommendation.imageUrl, result.imageUrl)
        assertEquals(recommendation.tileId, result.tileId)
        assertEquals(recommendation.receivedRank, result.receivedRank)
        assertEquals(recommendedAt, result.recommendedAt)
        assertEquals(DEFAULT_TIMES_SHOWN, result.impressions)
    }

    @Test
    fun `GIVEN a ContentRecommendation WHEN it is an object type containing the times shown THEN only the corpusItemId and impressions properties are mapped`() {
        val recommendation = PocketTestResources.contentRecommendation

        val result = recommendation.toImpressions()

        assertSame(recommendation.corpusItemId, result.corpusItemId)
        assertEquals(recommendation.impressions, result.impressions)
    }

    @Test
    fun `GIVEN a SponsoredContentEntity WHEN it is converted to be exposed to clients THEN a one to one mapping is made`() {
        val entity = PocketTestResources.sponsoredContentEntity

        val result = entity.toSponsoredContent()

        assertSame(entity.url, result.url)
        assertSame(entity.title, result.title)
        assertSame(entity.clickUrl, result.callbacks.clickUrl)
        assertSame(entity.impressionUrl, result.callbacks.impressionUrl)
        assertSame(entity.imageUrl, result.imageUrl)
        assertSame(entity.domain, result.domain)
        assertSame(entity.excerpt, result.excerpt)
        assertSame(entity.sponsor, result.sponsor)
        assertSame(entity.blockKey, result.blockKey)
        assertTrue(result.caps.currentImpressions.isEmpty())
        assertEquals(entity.flightCapCount, result.caps.flightCount)
        assertEquals(entity.flightCapPeriod, result.caps.flightPeriod)
        assertEquals(entity.priority, result.priority)
    }

    @Test
    fun `GIVEN a MarsSpocsResponseItem WHEN it is converted to the database object type THEN a one to one mapping is made`() {
        val marsSpocsResponseItem = PocketTestResources.marsSpocsResponseItem
        val result = marsSpocsResponseItem.toSponsoredContentEntity()

        assertSame(marsSpocsResponseItem.url, result.url)
        assertSame(marsSpocsResponseItem.title, result.title)
        assertSame(marsSpocsResponseItem.callbacks.clickUrl, result.clickUrl)
        assertSame(marsSpocsResponseItem.callbacks.impressionUrl, result.impressionUrl)
        assertSame(marsSpocsResponseItem.imageUrl, result.imageUrl)
        assertSame(marsSpocsResponseItem.domain, result.domain)
        assertSame(marsSpocsResponseItem.excerpt, result.excerpt)
        assertSame(marsSpocsResponseItem.sponsor, result.sponsor)
        assertSame(marsSpocsResponseItem.blockKey, result.blockKey)
        assertEquals(marsSpocsResponseItem.caps.day, result.flightCapCount)
        assertEquals(DEFAULT_FLIGHT_CAP_PERIOD_IN_SECONDS, result.flightCapPeriod)
        assertEquals(marsSpocsResponseItem.ranking.priority, result.priority)
    }

    @Test
    fun `GIVEN a RecommendationDataItem WHEN it is converted to the response item type THEN a one to one mapping is made`() {
        assertEquals(
            PocketTestResources.contentRecommendationResponseItem,
            PocketTestResources.recommendationDataItem.toContentRecommendationResponseItem(),
        )
    }

    @Test
    fun `GIVEN a null scheduled corpus item id and tile id WHEN a RecommendationDataItem is converted to the response item type THEN the defaults are used`() {
        val result =
            PocketTestResources.recommendationDataItem
                .copy(scheduledCorpusItemId = null, tileId = null)
                .toContentRecommendationResponseItem()

        assertEquals("", result.scheduledCorpusItemId)
        assertEquals(DEFAULT_TILE_ID, result.tileId)
    }

    @Test
    fun `GIVEN a CuratedRecommendationsResponse WHEN it is converted to the response item type THEN a one to one mapping is made`() {
        val result =
            CuratedRecommendationsResponse(
                    recommendedAt = 1L,
                    data = listOf(PocketTestResources.recommendationDataItem),
                )
                .toContentRecommendationsResponse()

        assertEquals(1L, result.recommendedAt)
        assertEquals(listOf(PocketTestResources.contentRecommendationResponseItem), result.data)
    }

    @Test
    fun `WHEN a language tag is mapped THEN return the matching curated recommendation locale`() {
        val locales =
            mapOf(
                Locale.forLanguageTag("fr") to CuratedRecommendationLocale.FR,
                Locale.forLanguageTag("fr-FR") to CuratedRecommendationLocale.FR_FR,
                Locale.forLanguageTag("es") to CuratedRecommendationLocale.ES,
                Locale.forLanguageTag("es-ES") to CuratedRecommendationLocale.ES_ES,
                Locale.forLanguageTag("it") to CuratedRecommendationLocale.IT,
                Locale.forLanguageTag("it-IT") to CuratedRecommendationLocale.IT_IT,
                Locale.forLanguageTag("en") to CuratedRecommendationLocale.EN,
                Locale.forLanguageTag("en-CA") to CuratedRecommendationLocale.EN_CA,
                Locale.forLanguageTag("en-GB") to CuratedRecommendationLocale.EN_GB,
                Locale.forLanguageTag("en-IE") to CuratedRecommendationLocale.EN_IE,
                Locale.forLanguageTag("en-US") to CuratedRecommendationLocale.EN_US,
                Locale.forLanguageTag("de") to CuratedRecommendationLocale.DE,
                Locale.forLanguageTag("de-DE") to CuratedRecommendationLocale.DE_DE,
                Locale.forLanguageTag("de-AT") to CuratedRecommendationLocale.DE_AT,
                Locale.forLanguageTag("de-CH") to CuratedRecommendationLocale.DE_CH,
                Locale.forLanguageTag("pl") to CuratedRecommendationLocale.PL,
                Locale.forLanguageTag("pl-PL") to CuratedRecommendationLocale.PL_PL,
            )

        locales.forEach { (locale, curatedRecommendationLocale) ->
            assertEquals(curatedRecommendationLocale, locale.toCuratedRecommendationLocale())
        }

        assertEquals(CuratedRecommendationLocale.EN, Locale.forLanguageTag("en-AU").toCuratedRecommendationLocale())
        assertEquals(CuratedRecommendationLocale.DE, Locale.forLanguageTag("de-LI").toCuratedRecommendationLocale())
        assertEquals(
            CuratedRecommendationLocale.EN_US,
            Locale.forLanguageTag("en-US-u-va-posix").toCuratedRecommendationLocale(),
        )
    }

    @Test
    fun `GIVEN an unsupported language WHEN a language tag is mapped THEN null is returned`() {
        assertNull(Locale.JAPAN.toCuratedRecommendationLocale())
        assertNull(Locale.forLanguageTag("").toCuratedRecommendationLocale())
        assertNull(Locale.forLanguageTag("zh-Hans-CN").toCuratedRecommendationLocale())
    }
}
