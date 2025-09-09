/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import androidx.annotation.VisibleForTesting
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.service.nimbus.evalJexlSafe
import mozilla.components.service.nimbus.messaging.use
import org.mozilla.experiments.nimbus.NimbusMessagingHelperInterface
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.CheckIfEligibleForReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.DoNotShowReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ReviewPromptShown
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ShowCustomReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ShowPlayStorePrompt
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.messaging.CustomAttributeProvider
import org.mozilla.fenix.utils.Settings

/**
 * [Middleware] evaluating the triggers to show a review prompt.
 *
 * @param settings [Settings] used to check the application shared preferences.
 * @param createJexlHelper Returns a helper for evaluating JEXL expressions.
 * @param timeNowInMillis Returns the current time in milliseconds. See [System.currentTimeMillis].
 * @param buildTriggerMainCriteria Builds a sequence of trigger's main criteria that all need to be true.
 * @param buildTriggerSubCriteria Builds a sequence of trigger's sub-criteria.
 * Only one of them needs to be true (in addition to the main criteria).
 */
class ReviewPromptMiddleware(
    private val settings: Settings,
    private val createJexlHelper: () -> NimbusMessagingHelperInterface,
    private val timeNowInMillis: () -> Long = System::currentTimeMillis,
    private val buildTriggerMainCriteria: (NimbusMessagingHelperInterface) -> Sequence<Boolean> =
        TiggerBuilder.mainCriteria(settings, timeNowInMillis),
    private val buildTriggerSubCriteria: (NimbusMessagingHelperInterface) -> Sequence<Boolean> =
        TiggerBuilder::subCriteria,
) : Middleware<AppState, AppAction> {

    private object TiggerBuilder {
        fun mainCriteria(
            settings: Settings,
            timeNowInMillis: () -> Long,
        ): (NimbusMessagingHelperInterface) -> Sequence<Boolean> = {
            sequence {
                yield(hasNotBeenPromptedLastFourMonths(settings, timeNowInMillis))
                yield(usedAppOnAtLeastFourOfLastSevenDaysTrigger(it))
            }
        }

        fun subCriteria(jexlHelper: NimbusMessagingHelperInterface): Sequence<Boolean> {
            return sequence {
                yield(createdAtLeastOneBookmark(jexlHelper))
                yield(isDefaultBrowserTrigger(jexlHelper))
            }
        }
    }

    override fun invoke(
        context: MiddlewareContext<AppState, AppAction>,
        next: (AppAction) -> Unit,
        action: AppAction,
    ) {
        if (action !is AppAction.ReviewPromptAction) {
            next(action)
            return
        }

        when (action) {
            CheckIfEligibleForReviewPrompt -> handleReviewPromptCheck(context)
            ReviewPromptShown -> settings.lastReviewPromptTimeInMillis = timeNowInMillis()
            DoNotShowReviewPrompt -> Unit
            ShowCustomReviewPrompt -> Unit
            ShowPlayStorePrompt -> Unit
        }

        next(action)
    }

    private fun handleReviewPromptCheck(context: MiddlewareContext<AppState, AppAction>) {
        if (context.state.reviewPrompt != ReviewPromptState.Unknown) {
            // We only want to try to show it once to avoid unnecessary disk reads.
            return
        }

        createJexlHelper().use { jexlHelper ->
            val allMainCriteriaSatisfied = buildTriggerMainCriteria(jexlHelper).all { it }
            if (!allMainCriteriaSatisfied) {
                context.dispatch(DoNotShowReviewPrompt)
                return@use
            }

            val atLeastOneOfSubCriteriaSatisfied = buildTriggerSubCriteria(jexlHelper).any { it }
            if (atLeastOneOfSubCriteriaSatisfied) {
                if (settings.isTelemetryEnabled) {
                    context.dispatch(ShowCustomReviewPrompt)
                } else {
                    context.dispatch(ShowPlayStorePrompt)
                }
            } else {
                context.dispatch(DoNotShowReviewPrompt)
            }
        }
    }
}

private const val APPRX_MONTH_IN_MILLIS: Long = 1000L * 60L * 60L * 24L * 30L
private const val NUMBER_OF_MONTHS_TO_PASS = 4

/**
 * Checks that the prompt hasn't been shown in the last 4 months
 * to avoid hitting the Play In-App Review API quota.
 */
fun hasNotBeenPromptedLastFourMonths(settings: Settings, timeNowInMillis: () -> Long): Boolean {
    if (settings.lastReviewPromptTimeInMillis == 0L) {
        // Has never been prompted.
        return true
    }

    val approximatelyFourMonthsAgo =
        timeNowInMillis() - (APPRX_MONTH_IN_MILLIS * NUMBER_OF_MONTHS_TO_PASS)
    return settings.lastReviewPromptTimeInMillis <= approximatelyFourMonthsAgo
}

/**
 * Evaluates whether the user has created at least one bookmark.
 *
 * Note: Because Nimbus limits data to 4 calendar years, this will ignore bookmarks created before then.
 */
@VisibleForTesting
internal fun createdAtLeastOneBookmark(jexlHelper: NimbusMessagingHelperInterface): Boolean {
    return jexlHelper.evalJexlSafe("'bookmark_added'|eventSum('Years', 4) >= 1")
}

/**
 * The raw string "is_default_browser" must match the json value provided in
 * [CustomAttributeProvider.getCustomAttributes].
 */
@VisibleForTesting
internal fun isDefaultBrowserTrigger(jexlHelper: NimbusMessagingHelperInterface) =
    jexlHelper.evalJexlSafe("is_default_browser")

/**
 * Evaluates whether the user has used the app on at least 4 distinct days
 * within the last 7 days. This does not require consecutive days.
 *
 * @return true if the user has opened the app on 4 or more days in the last 7, false otherwise
 */
@VisibleForTesting
internal fun usedAppOnAtLeastFourOfLastSevenDaysTrigger(
    jexlHelper: NimbusMessagingHelperInterface,
): Boolean {
    return jexlHelper.evalJexlSafe("'app_opened'|eventCountNonZero('Days', 7) >= 4")
}
