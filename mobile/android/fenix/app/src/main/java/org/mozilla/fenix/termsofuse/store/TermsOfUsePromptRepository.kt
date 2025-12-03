/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import org.mozilla.fenix.termsofuse.TOU_VERSION
import org.mozilla.fenix.utils.Settings

/**
 * Repository for preferences related to the terms of use bottom sheet.
 */
interface TermsOfUsePromptRepository {
    /**
     * Updates the Terms of Use related preferences when the user accepts the ToU.
     *
     *  @param nowMillis the current time in milliseconds.
     */
    fun updateHasAcceptedTermsOfUsePreference(nowMillis: Long = System.currentTimeMillis())

    /**
     * Updates the 'has postponed accepting terms of use' preference to true.
     */
    fun updateHasPostponedAcceptingTermsOfUsePreference()

    /**
     * Updates the 'last terms of use prompt time in millis' preference to the current time.
     *
     * @param currentTimeInMillis the current time in milliseconds.
     */
    fun updateLastTermsOfUsePromptTimeInMillis(currentTimeInMillis: Long = System.currentTimeMillis())

    /**
     * Increments the number of times the Terms of Use prompt has been displayed by 1.
     */
    fun incrementTermsOfUsePromptDisplayedCount()
}

/**
 * Default implementation of [TermsOfUsePromptRepository].
 *
 * @param settings the preferences settings
 */
class DefaultTermsOfUsePromptRepository(
    private val settings: Settings,
) : TermsOfUsePromptRepository {
    override fun updateHasAcceptedTermsOfUsePreference(nowMillis: Long) {
        settings.hasAcceptedTermsOfService = true
        settings.termsOfUseAcceptedVersion = TOU_VERSION
        settings.termsOfUseAcceptedTimeInMillis = nowMillis
    }

    override fun updateHasPostponedAcceptingTermsOfUsePreference() {
        settings.hasPostponedAcceptingTermsOfUse = true
    }

    override fun updateLastTermsOfUsePromptTimeInMillis(currentTimeInMillis: Long) {
        settings.lastTermsOfUsePromptTimeInMillis = currentTimeInMillis
    }

    override fun incrementTermsOfUsePromptDisplayedCount() {
        settings.termsOfUsePromptDisplayedCount++
    }
}
