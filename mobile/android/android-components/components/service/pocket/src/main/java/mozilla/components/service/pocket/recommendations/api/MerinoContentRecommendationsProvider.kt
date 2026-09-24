/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.api

import androidx.annotation.WorkerThread
import mozilla.appservices.merino.CuratedRecommendationsApiException
import mozilla.appservices.merino.CuratedRecommendationsClient
import mozilla.appservices.merino.CuratedRecommendationsClientInterface
import mozilla.appservices.merino.CuratedRecommendationsConfig
import mozilla.appservices.merino.CuratedRecommendationsRequest
import mozilla.components.concept.base.crash.Breadcrumb
import mozilla.components.concept.base.crash.CrashReporting
import mozilla.components.service.pocket.ContentRecommendationsRequestConfig
import mozilla.components.service.pocket.ext.toContentRecommendationsResponse
import mozilla.components.service.pocket.ext.toCuratedRecommendationLocale
import mozilla.components.service.pocket.logger
import mozilla.components.service.pocket.stories.api.PocketResponse

/**
 * Retrieves the content recommendations from the Merino server with the Application Services
 * [CuratedRecommendationsClient].
 *
 * See https://merino.services.mozilla.com/docs#/default/curated_content_api_v1_curated_recommendations_post for
 * documentation of the API endpoint.
 *
 * @property config [ContentRecommendationsRequestConfig] for content recommendations request.
 * @property crashReporter [CrashReporting] instance used for recording caught exceptions.
 * @param clientProvider Lambda that returns the [CuratedRecommendationsClientInterface] used to request the
 *   recommendations.
 */
internal class MerinoContentRecommendationsProvider(
    private val config: ContentRecommendationsRequestConfig,
    private val crashReporter: CrashReporting? = null,
    clientProvider: () -> CuratedRecommendationsClientInterface = {
        CuratedRecommendationsClient(
            config = CuratedRecommendationsConfig(baseHost = null, userAgentHeader = config.userAgent)
        )
    },
) : ContentRecommendationsProvider {
    private val client by lazy { clientProvider() }

    /**
     * Returns a response containing the content recommendations from the Merino server on success.
     *
     * @return a [PocketResponse.Success] with the content recommendations or a [PocketResponse.Failure] on error.
     */
    @WorkerThread
    override fun getContentRecommendations(): PocketResponse<ContentRecommendationsResponse> {
        val locale = config.locale.toCuratedRecommendationLocale()

        if (locale == null) {
            logger.error("Unsupported content recommendations locale: ${config.locale.toLanguageTag()}")
            return PocketResponse.wrap(null)
        }

        val response =
            try {
                client
                    .getCuratedRecommendations(
                        request =
                            CuratedRecommendationsRequest(
                                locale = locale,
                                region = config.region.takeIf { it.isNotBlank() },
                                count = config.count,
                                topics = config.topics.takeIf { it.isNotEmpty() },
                            )
                    )
                    .toContentRecommendationsResponse()
            } catch (e: CuratedRecommendationsApiException) {
                val message = "MerinoContentRecommendationsProvider - Failed to fetch the content recommendations"
                logger.error(message = message, throwable = e)
                crashReporter?.recordCrashBreadcrumb(Breadcrumb(message = message))

                // Only report the unexpected errors to avoid reports of network-level failure (e.g. connection
                // timeout, offline).
                if (e is CuratedRecommendationsApiException.Other) {
                    crashReporter?.submitCaughtException(e)
                }

                null
            }

        return PocketResponse.wrap(response)
    }
}
