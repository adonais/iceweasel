/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.ext

import androidx.annotation.VisibleForTesting
import java.util.Locale
import mozilla.appservices.merino.CuratedRecommendationLocale
import mozilla.appservices.merino.CuratedRecommendationsResponse
import mozilla.appservices.merino.RecommendationDataItem
import mozilla.components.service.pocket.PocketStory.ContentRecommendation
import mozilla.components.service.pocket.PocketStory.SponsoredContent
import mozilla.components.service.pocket.PocketStory.SponsoredContentCallbacks
import mozilla.components.service.pocket.PocketStory.SponsoredContentFrequencyCaps
import mozilla.components.service.pocket.mars.api.MarsSpocsResponseItem
import mozilla.components.service.pocket.mars.db.SponsoredContentEntity
import mozilla.components.service.pocket.recommendations.api.ContentRecommendationResponseItem
import mozilla.components.service.pocket.recommendations.api.ContentRecommendationsResponse
import mozilla.components.service.pocket.recommendations.db.ContentRecommendationEntity
import mozilla.components.service.pocket.recommendations.db.ContentRecommendationImpression
import mozilla.components.service.pocket.recommendations.utils.reformatImageUrl

@VisibleForTesting internal const val DEFAULT_TIMES_SHOWN = 0L

@VisibleForTesting internal const val DEFAULT_FLIGHT_CAP_PERIOD_IN_SECONDS = 24 * 60 * 60 // 1 Day

@VisibleForTesting internal const val DEFAULT_TILE_ID = 0L

/** Maps the sponsored content Room entities to the object type we expose to service clients. */
internal fun SponsoredContentEntity.toSponsoredContent(impressions: List<Long> = emptyList()) =
    SponsoredContent(
        url = url,
        title = title,
        callbacks =
            SponsoredContentCallbacks(
                clickUrl = clickUrl,
                impressionUrl = impressionUrl,
            ),
        imageUrl = imageUrl,
        domain = domain,
        excerpt = excerpt,
        sponsor = sponsor,
        blockKey = blockKey,
        caps =
            SponsoredContentFrequencyCaps(
                currentImpressions = impressions,
                flightCount = flightCapCount,
                flightPeriod = flightCapPeriod,
            ),
        priority = priority,
    )

/** Maps the sponsored content response item to the object type that is persisted locally. */
internal fun MarsSpocsResponseItem.toSponsoredContentEntity() =
    SponsoredContentEntity(
        url = url,
        title = title,
        clickUrl = callbacks.clickUrl,
        impressionUrl = callbacks.impressionUrl,
        imageUrl = imageUrl,
        domain = domain,
        excerpt = excerpt,
        sponsor = sponsor,
        blockKey = blockKey,
        flightCapCount = caps.day,
        flightCapPeriod = DEFAULT_FLIGHT_CAP_PERIOD_IN_SECONDS,
        priority = ranking.priority,
    )

/** Maps the Room entities to the object type that we expose to service clients. */
internal fun ContentRecommendationEntity.toContentRecommendation() =
    ContentRecommendation(
        corpusItemId = corpusItemId,
        scheduledCorpusItemId = scheduledCorpusItemId,
        url = url,
        title = title,
        excerpt = excerpt,
        topic = topic,
        publisher = publisher,
        isTimeSensitive = isTimeSensitive,
        imageUrl = imageUrl,
        tileId = tileId,
        receivedRank = receivedRank,
        recommendedAt = recommendedAt,
        impressions = impressions,
    )

/**
 * Maps the content recommendation response item to the object type that is persisted locally.
 *
 * @param recommendedAt A timestamp indicating when the content recommendations was recommended.
 */
internal fun ContentRecommendationResponseItem.toContentRecommendationEntity(recommendedAt: Long) =
    ContentRecommendationEntity(
        corpusItemId = corpusItemId,
        scheduledCorpusItemId = scheduledCorpusItemId,
        url = url,
        title = title,
        excerpt = excerpt,
        topic = topic,
        publisher = publisher,
        isTimeSensitive = isTimeSensitive,
        imageUrl = imageUrl,
        tileId = tileId,
        receivedRank = receivedRank,
        recommendedAt = recommendedAt,
        impressions = DEFAULT_TIMES_SHOWN,
    )

/**
 * Maps the content recommendation client object to an object that can facilitate updating the
 * [ContentRecommendation.impressions] property that is persisted locally.
 */
internal fun ContentRecommendation.toImpressions() =
    ContentRecommendationImpression(
        corpusItemId = corpusItemId,
        impressions = impressions,
    )

/**
 * Maps the [Locale] to the [CuratedRecommendationLocale] to request. Falls back to the language when the region is
 * unsupported, or null when the locale is unsupported.
 */
internal fun Locale.toCuratedRecommendationLocale(): CuratedRecommendationLocale? =
    findCuratedRecommendationLocale("${language}_$country") ?: findCuratedRecommendationLocale(language)

/**
 * Returns the [CuratedRecommendationLocale] whose name matches the provided language and region, or null if it is
 * unsupported.
 */
private fun findCuratedRecommendationLocale(name: String): CuratedRecommendationLocale? {
    val uppercaseName = name.uppercase()
    return CuratedRecommendationLocale.entries.firstOrNull { it.name == uppercaseName }
}

/**
 * Maps the curated recommendations returned by the Merino client to the content recommendations response that is
 * persisted locally.
 */
internal fun CuratedRecommendationsResponse.toContentRecommendationsResponse() =
    ContentRecommendationsResponse(
        recommendedAt = recommendedAt,
        data = data.map { it.toContentRecommendationResponseItem() },
    )

/**
 * Maps a curated recommendation returned by the Merino client to the content recommendation response item that is
 * persisted locally.
 */
internal fun RecommendationDataItem.toContentRecommendationResponseItem() =
    ContentRecommendationResponseItem(
        corpusItemId = corpusItemId,
        scheduledCorpusItemId = scheduledCorpusItemId.orEmpty(),
        url = url,
        title = title,
        excerpt = excerpt,
        topic = topic,
        publisher = publisher,
        isTimeSensitive = isTimeSensitive,
        imageUrl = reformatImageUrl(imageUrl),
        tileId = tileId ?: DEFAULT_TILE_ID,
        receivedRank = receivedRank.toInt(),
    )
