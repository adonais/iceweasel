/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.helpers

import mozilla.appservices.merino.CuratedRecommendationsResponse
import mozilla.appservices.merino.RecommendationDataItem
import mozilla.components.service.pocket.PocketStory.ContentRecommendation
import mozilla.components.service.pocket.PocketStory.SponsoredContent
import mozilla.components.service.pocket.PocketStory.SponsoredContentCallbacks
import mozilla.components.service.pocket.PocketStory.SponsoredContentFrequencyCaps
import mozilla.components.service.pocket.mars.api.MarsSpocFrequencyCaps
import mozilla.components.service.pocket.mars.api.MarsSpocRanking
import mozilla.components.service.pocket.mars.api.MarsSpocResponseCallbacks
import mozilla.components.service.pocket.mars.api.MarsSpocsResponse
import mozilla.components.service.pocket.mars.api.MarsSpocsResponseItem
import mozilla.components.service.pocket.mars.db.SponsoredContentEntity
import mozilla.components.service.pocket.recommendations.api.ContentRecommendationResponseItem
import mozilla.components.service.pocket.recommendations.api.ContentRecommendationsResponse
import mozilla.components.service.pocket.recommendations.db.ContentRecommendationEntity
import mozilla.components.service.pocket.recommendations.utils.IMAGE_URL

private const val POCKET_DIR = "pocket"

/** Accessors to resources used in testing. */
internal object PocketTestResources {
    val contentRecommendationsJSONResponse =
        this::class.java.classLoader!!.getResource("$POCKET_DIR/content_recommendations_response.json")!!.readText()

    val contentRecommendationsNullUrlResponse =
        this::class
            .java
            .classLoader!!
            .getResource("$POCKET_DIR/content_recommendations_null_url_response.json")!!
            .readText()

    val marsSponsoredStoriesJSONResponse =
        this::class.java.classLoader!!.getResource("$POCKET_DIR/mars_sponsored_stories_response.json")!!.readText()

    val marsSponsoredStoriesNullUrlResponse =
        this::class
            .java
            .classLoader!!
            .getResource("$POCKET_DIR/mars_sponsored_stories_null_url_response.json")!!
            .readText()

    val contentRecommendationEntity =
        ContentRecommendationEntity(
            corpusItemId = "1111",
            scheduledCorpusItemId = "2222",
            url = "https://getpocket.com/",
            title = "Pocket",
            excerpt = "Pocket",
            topic = "food",
            publisher = "Pocket",
            isTimeSensitive = false,
            imageUrl = "https://img-getpocket.cdn.mozilla.net/",
            tileId = 1,
            receivedRank = 2,
            recommendedAt = 1L,
            impressions = 1,
        )

    val contentRecommendation =
        ContentRecommendation(
            corpusItemId = "1111",
            scheduledCorpusItemId = "2222",
            url = "https://getpocket.com/",
            title = "Pocket",
            excerpt = "Pocket",
            topic = "food",
            publisher = "Pocket",
            isTimeSensitive = false,
            imageUrl = "https://img-getpocket.cdn.mozilla.net/",
            tileId = 1,
            receivedRank = 2,
            recommendedAt = 1L,
            impressions = 1,
        )

    val contentRecommendationResponseItem1 =
        ContentRecommendationResponseItem(
            corpusItemId = "1",
            scheduledCorpusItemId = "1111",
            url = "https://getpocket.com/1",
            title = "Pocket1",
            excerpt = "Pocket1",
            topic = "food",
            publisher = "Pocket1",
            isTimeSensitive = false,
            imageUrl =
                "https://img-getpocket.cdn.mozilla.net/{wh}/filters:format(jpeg):quality(60):no_upscale():strip_exif()/https%3A%2F%2Fimg-getpocket.cdn.mozilla.net%2F1",
            tileId = 1,
            receivedRank = 1,
        )
    private val contentRecommendationResponseItem2 =
        ContentRecommendationResponseItem(
            corpusItemId = "2",
            scheduledCorpusItemId = "2222",
            url = "https://getpocket.com/2",
            title = "Pocket2",
            excerpt = "Pocket2",
            topic = "business",
            publisher = "Pocket2",
            isTimeSensitive = true,
            imageUrl =
                "https://img-getpocket.cdn.mozilla.net/{wh}/filters:format(jpeg):quality(60):no_upscale():strip_exif()/https%3A%2F%2Fimg-getpocket.cdn.mozilla.net%2F2",
            tileId = 2,
            receivedRank = 2,
        )
    private val contentRecommendationResponseItem3 =
        ContentRecommendationResponseItem(
            corpusItemId = "3",
            scheduledCorpusItemId = "3333",
            url = "https://getpocket.com/3",
            title = "Pocket3",
            excerpt = "Pocket3",
            topic = null,
            publisher = "Pocket3",
            isTimeSensitive = true,
            imageUrl =
                "https://img-getpocket.cdn.mozilla.net/{wh}/filters:format(jpeg):quality(60):no_upscale():strip_exif()/https%3A%2F%2Fimg-getpocket.cdn.mozilla.net%2F3",
            tileId = 3,
            receivedRank = 3,
        )
    private val contentRecommendationResponseItem4 =
        ContentRecommendationResponseItem(
            corpusItemId = "4",
            scheduledCorpusItemId = "4444",
            url = "https://getpocket.com/4",
            title = "Pocket4",
            excerpt = "Pocket4",
            topic = "career",
            publisher = "Pocket4",
            isTimeSensitive = true,
            imageUrl =
                "https://img-getpocket.cdn.mozilla.net/{wh}/filters:format(jpeg):quality(60):no_upscale():strip_exif()/https%3A%2F%2Fimg-getpocket.cdn.mozilla.net%2F4",
            tileId = 4,
            receivedRank = 4,
        )

    private val contentRecommendationResponseItems =
        listOf(
            contentRecommendationResponseItem1,
            contentRecommendationResponseItem2,
            contentRecommendationResponseItem3,
            contentRecommendationResponseItem4,
        )

    val contentRecommendationsResponse =
        ContentRecommendationsResponse(
            recommendedAt = 0,
            data = contentRecommendationResponseItems,
        )

    val recommendationDataItem =
        RecommendationDataItem(
            corpusItemId = "corpusItemId",
            scheduledCorpusItemId = "scheduledCorpusItemId",
            url = "https://mozilla.org",
            title = "title",
            excerpt = "excerpt",
            topic = "topic",
            publisher = "publisher",
            isTimeSensitive = true,
            imageUrl = "https://test.com/image1.jpg",
            iconUrl = "https://test.com/icon1.jpg",
            tileId = 1L,
            receivedRank = 2L,
        )

    val contentRecommendationResponseItem =
        ContentRecommendationResponseItem(
            corpusItemId = "corpusItemId",
            scheduledCorpusItemId = "scheduledCorpusItemId",
            url = "https://mozilla.org",
            title = "title",
            excerpt = "excerpt",
            topic = "topic",
            publisher = "publisher",
            isTimeSensitive = true,
            imageUrl = IMAGE_URL + "https%3A%2F%2Ftest.com%2Fimage1.jpg",
            tileId = 1L,
            receivedRank = 2,
        )

    val curatedRecommendationsResponse =
        CuratedRecommendationsResponse(
            recommendedAt = 1L,
            data = listOf(recommendationDataItem),
        )

    internal val marsSpocsResponseItem =
        MarsSpocsResponseItem(
            format = "spoc",
            url = "https://firefox.com",
            callbacks =
                MarsSpocResponseCallbacks(
                    clickUrl = "https://firefox.com/click",
                    impressionUrl = "https://firefox.com/impression",
                ),
            imageUrl = "https://test.com/image1.jpg",
            title = "Firefox",
            domain = "firefox.com",
            excerpt = "Mozilla Firefox",
            sponsor = "Mozilla",
            blockKey = "1",
            caps =
                MarsSpocFrequencyCaps(
                    capKey = "2",
                    day = 10,
                ),
            ranking =
                MarsSpocRanking(
                    priority = 3,
                    itemScore = 1F,
                ),
        )

    internal val marsSpocsResponse = MarsSpocsResponse(spocs = listOf(marsSpocsResponseItem))

    internal val sponsoredContentEntity =
        SponsoredContentEntity(
            url = "https://firefox.com",
            title = "Firefox",
            clickUrl = "https://firefox.com/click",
            impressionUrl = "https://firefox.com/impression",
            imageUrl = "https://test.com/image1.jpg",
            domain = "firefox.com",
            excerpt = "Mozilla Firefox",
            sponsor = "Mozilla",
            blockKey = "1",
            flightCapCount = 10,
            flightCapPeriod = 86400,
            priority = 3,
        )

    internal val sponsoredContent =
        SponsoredContent(
            url = "https://firefox.com",
            title = "Firefox",
            callbacks =
                SponsoredContentCallbacks(
                    clickUrl = "https://firefox.com/click",
                    impressionUrl = "https://firefox.com/impression",
                ),
            imageUrl = "https://test.com/image1.jpg",
            domain = "firefox.com",
            excerpt = "Mozilla Firefox",
            sponsor = "Mozilla",
            blockKey = "1",
            caps =
                SponsoredContentFrequencyCaps(
                    currentImpressions = emptyList(),
                    flightCount = 10,
                    flightPeriod = 86400,
                ),
            priority = 3,
        )
}
