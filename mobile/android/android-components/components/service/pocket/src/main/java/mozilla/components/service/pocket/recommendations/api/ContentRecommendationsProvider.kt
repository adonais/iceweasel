/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.api

import androidx.annotation.WorkerThread
import mozilla.components.service.pocket.stories.api.PocketResponse

/** A contract that indicates how a content recommendations provider must behave. */
internal interface ContentRecommendationsProvider {

    /**
     * Returns a response containing the content recommendations.
     *
     * @return a [PocketResponse.Success] with the content recommendations or a [PocketResponse.Failure] on error.
     */
    @WorkerThread fun getContentRecommendations(): PocketResponse<ContentRecommendationsResponse>
}
