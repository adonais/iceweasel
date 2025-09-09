/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import org.mozilla.fenix.Config
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.utils.Settings.Companion.FIVE_DAYS_MS
import org.mozilla.fenix.utils.Settings.Companion.THIRTY_SECONDS_MS

/**
 * Helps determine when the terms of use prompt should show.
 *
 * @param settings app settings
 */
class TermsOfUseManager(private val settings: Settings) {

    private var isFirstCheckSinceStartingApp: Boolean = false

    /**
     * Determines whether the Terms of Use bottom sheet should be shown on the homepage.
     */
    fun shouldShowTermsOfUsePromptOnHomepage() =
        shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true)

    /**
     * Determines whether the Terms of Use bottom sheet should be shown in the browser fragment.
     */
    fun shouldShowTermsOfUsePromptOnBrowserFragment() = shouldShowTermsOfUsePrompt()

    /**
     * Determines whether the Terms of Use bottom sheet should be shown.
     *
     * This function returns `true` if:
     * - The user has not accepted the Terms of Use.
     * - The user has not postponed accepting the Terms of Use or it's been at least 5 days since they did.
     * - This is the first time checking to see if we should show the prompt since starting the app
     *   OR the [ignoreFirstCheckSinceStartingApp] flag is true (we should ignore this when checking from homepage).
     * - The current build channel is a debug build.
     *
     * @param ignoreFirstCheckSinceStartingApp if we should ignore the [isFirstCheckSinceStartingApp] value.
     *   It should be ignored when checking from homepage.
     * @param currentTimeInMillis the current time in milliseconds
     * @return `true` if the Terms of Use bottom sheet should be shown; otherwise, `false`.
     */
    @Suppress("ReturnCount")
    private fun shouldShowTermsOfUsePrompt(
        ignoreFirstCheckSinceStartingApp: Boolean = false,
        currentTimeInMillis: Long = System.currentTimeMillis(),
    ): Boolean {
        if (settings.hasAcceptedTermsOfService) return false

        val isFirstCheck = isFirstCheckSinceStartingApp
        isFirstCheckSinceStartingApp = false

        val durationSinceLastPrompt = currentTimeInMillis - settings.lastTermsOfUsePromptTimeInMillis
        val durationBetweenPrompts = if (settings.isDebugTermsOfServiceTriggerTimeEnabled) {
            THIRTY_SECONDS_MS
        } else {
            FIVE_DAYS_MS
        }

        if (settings.hasPostponedAcceptingTermsOfUse && durationSinceLastPrompt < durationBetweenPrompts) return false
        if (!ignoreFirstCheckSinceStartingApp && !isFirstCheck) return false
        if (!Config.channel.isDebug) return false

        return true
    }

    /**
     * Called from the [org.mozilla.fenix.HomeActivity]'s onStart.  Used to track the first check
     * since starting the app.
     */
    fun onStart() {
        isFirstCheckSinceStartingApp = true
    }
}
