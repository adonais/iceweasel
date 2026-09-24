/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.api

import androidx.annotation.VisibleForTesting
import androidx.annotation.WorkerThread
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import mozilla.components.concept.fetch.Client
import mozilla.components.service.pocket.ContentRecommendationsRequestConfig
import mozilla.components.service.pocket.recommendations.utils.reformatImageUrl
import mozilla.components.service.pocket.stories.api.PocketResponse

/**
 * Performs requests to the retrieve the content recommendations from the provided [rawEndpoint].
 *
 * @see [newInstance] to retrieve an instance.
 */
internal class ContentRecommendationsEndpoint
internal constructor(@get:VisibleForTesting internal val rawEndpoint: ContentRecommendationEndpointRaw) :
    ContentRecommendationsProvider {
    /**
     * Returns a response containing the content recommendations from the provided endpoint on success.
     *
     * @return a [PocketResponse.Success] with the decoded payload response of the content recommendations or a
     *   [PocketResponse.Failure] on error.
     */
    @WorkerThread
    override fun getContentRecommendations(): PocketResponse<ContentRecommendationsResponse> {
        val response =
            rawEndpoint.getContentRecommendations()?.let {
                try {
                    val json = Json { ignoreUnknownKeys = true }
                    val response = json.decodeFromString<ContentRecommendationsResponse>(it)
                    response.copy(
                        data =
                            response.data.map { item ->
                                item.copy(imageUrl = reformatImageUrl(item.imageUrl))
                            }
                    )
                } catch (e: SerializationException) {
                    null
                }
            }
        return PocketResponse.wrap(response)
    }

    companion object {
        /**
         * Returns a new instance of [ContentRecommendationsEndpoint].
         *
         * @param client The HTTP [Client] to use for network requests.
         * @param config Configuration for content recommendations request.
         */
        fun newInstance(
            client: Client,
            config: ContentRecommendationsRequestConfig,
        ): ContentRecommendationsEndpoint {
            val rawEndpoint = ContentRecommendationEndpointRaw.newInstance(client, config)
            return ContentRecommendationsEndpoint(rawEndpoint = rawEndpoint)
        }
    }
}
