/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.CheckIfEligibleForReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.DoNotShowReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ReviewPromptShown
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ShowCustomReviewPrompt
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction.ShowPlayStorePrompt
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.utils.Settings

/**
 * [Middleware] checking if any of the triggers to show a review prompt is satisfied.
 *
 * @param settings [Settings] used to check the application shared preferences.
 * @param timeNowInMillis Returns the current time in milliseconds. See [System.currentTimeMillis].
 * @param triggers Returns a sequence of triggers determining if we should show a review prompt.
 * Because it is evaluated lazily, it stops executing the checks after the first successful one.
 */
class ReviewPromptMiddleware(
    private val settings: Settings,
    private val timeNowInMillis: () -> Long = { System.currentTimeMillis() },
    private val triggers: () -> Sequence<Boolean> = {
        sequence {
            yield(legacyReviewPromptTrigger(settings))
        }
    },
) : Middleware<AppState, AppAction> {

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

        if (hasBeenPromptedLastFourMonths()) {
            // We don't want to hit the Play In-App Review API quota.
            context.dispatch(DoNotShowReviewPrompt)
            return
        }

        if (triggers().contains(true)) {
            if (settings.isTelemetryEnabled) {
                context.dispatch(ShowCustomReviewPrompt)
            } else {
                context.dispatch(ShowPlayStorePrompt)
            }
        } else {
            context.dispatch(DoNotShowReviewPrompt)
        }
    }

    private fun hasBeenPromptedLastFourMonths(): Boolean {
        if (settings.lastReviewPromptTimeInMillis == 0L) {
            // Has never been prompted.
            return false
        }

        val approximatelyFourMonthsAgo =
            timeNowInMillis() - (APPRX_MONTH_IN_MILLIS * NUMBER_OF_MONTHS_TO_PASS)
        return settings.lastReviewPromptTimeInMillis > approximatelyFourMonthsAgo
    }

    private companion object {
        const val APPRX_MONTH_IN_MILLIS: Long = 1000L * 60L * 60L * 24L * 30L
        const val NUMBER_OF_MONTHS_TO_PASS = 4
    }
}

private const val NUMBER_OF_LAUNCHES_REQUIRED = 5

/**
 * Matches logic from [ReviewPromptController.shouldShowPrompt].
 * Kept for parity. To be replaced by a set of new triggers.
 */
fun legacyReviewPromptTrigger(settings: Settings): Boolean {
    val hasOpenedAtLeastFiveTimes =
        settings.numberOfAppLaunches >= NUMBER_OF_LAUNCHES_REQUIRED
    return settings.isDefaultBrowser && hasOpenedAtLeastFiveTimes
}
