/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.fake

import mozilla.appservices.merino.CuratedRecommendationsApiException
import mozilla.appservices.merino.CuratedRecommendationsClientInterface
import mozilla.appservices.merino.CuratedRecommendationsRequest
import mozilla.appservices.merino.CuratedRecommendationsResponse

/**
 * A fake [CuratedRecommendationsClientInterface] that records the [request] it received.
 *
 * @property response The [CuratedRecommendationsResponse] to return.
 * @property exception The [CuratedRecommendationsApiException] to throw instead of returning the [response].
 */
internal class FakeCuratedRecommendationsClient(
    private val response: CuratedRecommendationsResponse =
        CuratedRecommendationsResponse(recommendedAt = 0L, data = emptyList()),
    private val exception: CuratedRecommendationsApiException? = null,
) : CuratedRecommendationsClientInterface {

    var request: CuratedRecommendationsRequest? = null
        private set

    override fun getCuratedRecommendations(request: CuratedRecommendationsRequest): CuratedRecommendationsResponse {
        this.request = request
        exception?.let { throw it }
        return response
    }
}
