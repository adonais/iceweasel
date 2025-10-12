/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.annotation.VisibleForTesting
import androidx.core.net.toUri
import com.google.android.play.core.review.ReviewException
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.BrowserDirection
import org.mozilla.fenix.GleanMetrics.ReviewPrompt
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.settings.SupportUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val logger = Logger("PlayStoreReviewPromptController")

/**
 * Wraps the Play Store In-App Review API.
 */
class PlayStoreReviewPromptController(
    private val manager: ReviewManager,
    private val numberOfAppLaunches: () -> Int,
) {

    /**
     * Launch the in-app review flow, unless we've hit the quota.
     */
    suspend fun tryPromptReview(activity: Activity) {
        logger.info("tryPromptReview in progress...")
        val reviewInfoFlow = withContext(Dispatchers.IO) { manager.requestReviewFlow() }

        reviewInfoFlow.addOnCompleteListener {
            val resultString = if (it.isSuccessful) {
                logger.info("Review flow launched.")
                // Launch the in-app flow.
                manager.launchReviewFlow(activity, it.result)

                it.result.toString()
            } else {
                // Launch the Play store flow.
                val reviewErrorCode =
                    (it.exception as? ReviewException)?.errorCode ?: ERROR_CODE_UNEXPECTED
                logger.warn("Failed to launch in-app review flow due to: $reviewErrorCode .")

                tryLaunchPlayStoreReview(activity)

                "reviewErrorCode=$reviewErrorCode"
            }

            recordReviewPromptEvent(
                reviewInfoAsString = resultString,
                numberOfAppLaunches = numberOfAppLaunches(),
                now = Date(),
            )
        }

        logger.info("tryPromptReview completed.")
    }

    /**
     * Try to launch the play store review flow.
     */
    fun tryLaunchPlayStoreReview(activity: Activity) {
        logger.info("tryLaunchPlayStoreReview in progress...")

        try {
            logger.info("Navigating to Play store listing.")
            activity.startActivity(
                Intent(Intent.ACTION_VIEW, SupportUtils.RATE_APP_URL.toUri()),
            )
        } catch (e: ActivityNotFoundException) {
            // Device without the play store installed.
            // Opening the play store website.
            (activity as HomeActivity).openToBrowserAndLoad(
                searchTermOrURL = SupportUtils.FENIX_PLAY_STORE_URL,
                newTab = true,
                from = BrowserDirection.FromGlobal,
            )
            logger.warn("Failed to launch play store review flow due to: $e .")
        }

        logger.info("tryLaunchPlayStoreReview completed.")
    }

    companion object {
        /**
         * Placeholder for unexpected exception type.
         */
        private const val ERROR_CODE_UNEXPECTED: Int = -42
    }
}

/**
 * Records a [ReviewPrompt] with the required data.
 *
 * **Note:** The docs for [ReviewManager.launchReviewFlow] state 'In some circumstances the review
 * flow will not be shown to the user, e.g. they have already seen it recently, so do not assume that
 * calling this method will always display the review dialog.'
 * However, investigation has shown that a [ReviewInfo] instance with the flag:
 * - 'isNoOp=true' indicates that the prompt has NOT been displayed.
 * - 'isNoOp=false' indicates that a prompt has been displayed.
 * [ReviewManager.launchReviewFlow] will modify the ReviewInfo instance which can be used to determine
 * which of these flags is present.
 */
@VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
fun recordReviewPromptEvent(
    reviewInfoAsString: String,
    numberOfAppLaunches: Int,
    now: Date,
) {
    val formattedLocalDatetime =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(now)

    // The internals of ReviewInfo cannot be accessed directly or cast nicely, so lets simply use
    // the object as a string.
    // ReviewInfo is susceptible to changes outside of our control hence the catch-all 'else' statement.
    val promptWasDisplayed = if (reviewInfoAsString.contains("isNoOp=true")) {
        "false"
    } else if (reviewInfoAsString.contains("isNoOp=false")) {
        "true"
    } else {
        "error"
    }

    ReviewPrompt.promptAttempt.record(
        ReviewPrompt.PromptAttemptExtra(
            promptWasDisplayed = promptWasDisplayed,
            localDatetime = formattedLocalDatetime,
            numberOfAppLaunches = numberOfAppLaunches,
        ),
    )
}
