/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.summarization

import androidx.navigation.NavController
import mozilla.components.browser.state.state.SessionState
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.summarization.eligibility.SummarizationEligibilityChecker

/**
 * Decides whether the current tab is eligible for summarization and, if so, navigates to the
 * summarization screen.
 *
 * @param summarizationSettings provides the current feature/gesture enabled state.
 * @param eligibilityChecker checks whether the page content is eligible (e.g. language).
 * @param getCurrentTab returns the tab to evaluate, or null if there is none.
 */
class SummarizationNavigator(
    private val summarizationSettings: SummarizationSettingsBinding,
    private val eligibilityChecker: SummarizationEligibilityChecker,
    private val getCurrentTab: () -> SessionState?,
) {

    /**
     * Navigate to the summarization screen if the current tab is eligible.
     *
     * @param navController the [NavController] to navigate with.
     * @param fromShakeGesture Whether the summarization feature was triggered by a shake gesture.
     */
    suspend fun navigateToSummarizationIfEligible(
        navController: NavController,
        fromShakeGesture: Boolean,
    ) {
        with(navController) {
            // If the feature (or the shake gesture) was disabled in the bottom sheet hosted
            // settings but the hosting screen has not been recreated yet, we need to re-check it
            // is still active before proceeding.
            val featureEnabled = summarizationSettings.isFeatureEnabled.value &&
                (!fromShakeGesture || summarizationSettings.isGestureEnabled.value)

            if (!featureEnabled) {
                return
            }

            // We don't want to navigate to the summarization fragment if the current
            // tab is private.
            val isPrivate = getCurrentTab()?.content?.private == true

            // We don't want to navigate to the summarization fragment if the current
            // tab is loading.
            val isPageLoading = getCurrentTab()?.content?.loading == true

            // Since the summarization fragment is in a dialog, it's possible that we
            // can still detect shakes in the background. Don't try to navigate twice.
            val currentDestinationIsNotTheBrowser = currentDestination?.id != R.id.browserFragment

            // evaluate this lazy, to try and avoid querying the engine unless necessary
            val isEnglishContent: suspend () -> Boolean = {
                getCurrentTab()?.engineState?.engineSession?.let { session ->
                    eligibilityChecker.checkLanguage(session).getOrNull()
                } ?: false
            }

            // this can be removed when we get rid of language gating
            @Suppress("ComplexCondition")
            if (isPrivate ||
                isPageLoading ||
                currentDestinationIsNotTheBrowser ||
                !isEnglishContent()
            ) {
                return
            }

            navigate(
                BrowserFragmentDirections.actionBrowserFragmentToSummarizationFragment(fromShakeGesture),
            )
        }
    }
}
