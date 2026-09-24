/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket

import android.content.Context
import androidx.annotation.VisibleForTesting
import mozilla.components.concept.base.crash.CrashReporting
import mozilla.components.service.pocket.PocketStory.ContentRecommendation
import mozilla.components.service.pocket.PocketStory.SponsoredContent
import mozilla.components.service.pocket.mars.SponsoredContentsUseCases
import mozilla.components.service.pocket.recommendations.ContentRecommendationsUseCases
import mozilla.components.service.pocket.update.ContentRecommendationsRefreshScheduler
import mozilla.components.service.pocket.update.SponsoredContentsRefreshScheduler

/**
 * Allows for getting a list of pocket stories based on the provided [PocketStoriesConfig]
 *
 * @param context Android Context. Prefer sending application context to limit the possibility of even small leaks.
 * @param pocketStoriesConfig Configuration for how and what pocket stories to get.
 * @param crashReporter Optional [CrashReporting] instance used for recording caught exceptions.
 */
class PocketStoriesService(
    private val context: Context,
    private val pocketStoriesConfig: PocketStoriesConfig,
    private val crashReporter: CrashReporting? = null,
) {
    @VisibleForTesting
    internal var contentRecommendationsRefreshScheduler = ContentRecommendationsRefreshScheduler(pocketStoriesConfig)

    @VisibleForTesting
    internal var sponsoredContentsRefreshScheduler = SponsoredContentsRefreshScheduler(pocketStoriesConfig)

    @VisibleForTesting
    internal var contentRecommendationsUseCases =
        ContentRecommendationsUseCases(
            appContext = context,
            client = pocketStoriesConfig.client,
            config = pocketStoriesConfig.contentRecommendationsParams,
            crashReporter = crashReporter,
        )

    @VisibleForTesting
    internal var sponsoredContentsUseCases =
        SponsoredContentsUseCases(
            appContext = context,
            client = pocketStoriesConfig.client,
            config = pocketStoriesConfig.marsSponsoredContentsParams,
        )

    /**
     * Starts a work request in the background to periodically update the list of content recommendations.
     *
     * Use this at an as high as possible level in your application. Must be paired in a similar way with the
     * [stopPeriodicContentRecommendationsRefresh] method.
     *
     * This starts the process of downloading and caching content recommendations in the background and making them
     * available when the [getContentRecommendations] method is called.
     */
    fun startPeriodicContentRecommendationsRefresh() {
        GlobalDependencyProvider.ContentRecommendations.initialize(contentRecommendationsUseCases)
        contentRecommendationsRefreshScheduler.startPeriodicWork(context)
    }

    /** Stops the work request to periodically update the list of content recommendations. */
    fun stopPeriodicContentRecommendationsRefresh() {
        contentRecommendationsRefreshScheduler.stopPeriodicWork(context)
        GlobalDependencyProvider.ContentRecommendations.reset()
    }

    /** Returns a list of [ContentRecommendation] based on the initial [pocketStoriesConfig]. */
    suspend fun getContentRecommendations(): List<ContentRecommendation> {
        return contentRecommendationsUseCases.getContentRecommendations()
    }

    /**
     * Updates the number of impressions (times shown) for a list of [ContentRecommendation]s.
     *
     * @param recommendationsShown The list of [ContentRecommendation]s with updated impressions to persist in storage.
     */
    suspend fun updateRecommendationsImpressions(recommendationsShown: List<ContentRecommendation>) {
        contentRecommendationsUseCases.updateRecommendationsImpressions(recommendationsShown)
    }

    /**
     * Starts a work request in the background to periodically refresh the list of sponsored contents.
     *
     * Use this at an as high as possible level in your application. Must be paired in a similar way with the
     * [stopPeriodicSponsoredContentsRefresh] method.
     *
     * This starts the process of downloading and caching sponsored contents in the background and making them available
     * when the [getSponsoredContents] method is called.
     */
    fun startPeriodicSponsoredContentsRefresh() {
        GlobalDependencyProvider.SponsoredContents.initialize(sponsoredContentsUseCases)
        sponsoredContentsRefreshScheduler.startPeriodicRefreshes(context)
    }

    /** Stops the work request to periodically refresh the list of sponsored contents. */
    fun stopPeriodicSponsoredContentsRefresh() {
        sponsoredContentsRefreshScheduler.stopPeriodicRefreshes(context)
        GlobalDependencyProvider.SponsoredContents.reset()
    }

    /** Returns a list of [SponsoredContent] based on the initial [pocketStoriesConfig]. */
    suspend fun getSponsoredContents(): List<SponsoredContent> {
        return sponsoredContentsUseCases.getSponsoredContents()
    }

    /**
     * Records the sponsored content impressions from the provided list of sponsored content URLs.
     *
     * @param impressions A list of sponsored content URLs that have been viewed.
     */
    suspend fun recordSponsoredContentImpressions(impressions: List<String>) {
        sponsoredContentsUseCases.recordImpressions.invoke(impressions)
    }

    /**
     * Deletes all data persisted for sponsored content. This returns immediately but will handle the profile deletion
     * in background.
     */
    fun deleteUser() {
        GlobalDependencyProvider.SponsoredContents.initialize(sponsoredContentsUseCases)
        sponsoredContentsRefreshScheduler.stopPeriodicRefreshes(context)
        sponsoredContentsRefreshScheduler.scheduleUserDeletion(context)
    }
}
