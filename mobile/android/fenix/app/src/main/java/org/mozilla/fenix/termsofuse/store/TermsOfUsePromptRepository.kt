/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import org.mozilla.fenix.utils.Settings

/**
 * Repository for preferences related to the terms of use bottom sheet.
 */
interface TermsOfUsePromptRepository {
    /**
     * Updates the 'has accepted terms of use' preference to true.
     */
    fun updateHasAcceptedTermsOfUsePreference()

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
     * Updates the 'has clicked the term of use prompt link' preference to true.
     */
    fun updateHasClickedTermOfUsePromptLinkPreference()

    /**
     * Updates the 'has clicked the term of use prompt "remind me later" action' preference to true.
     */
    fun updateHasClickedTermOfUsePromptRemindMeLaterPreference()

    /**
     * Increments the number of times the Terms of Use prompt has been displayed by 1.
     */
    fun incrementTermsOfUsePromptDisplayedCount()
}

/**
 * Default implementation of [TermsOfUsePromptRepository]
 *
 * @param settings the preferences settings
 */
class DefaultTermsOfUsePromptRepository(
    private val settings: Settings,
) : TermsOfUsePromptRepository {
    override fun updateHasAcceptedTermsOfUsePreference() {
        settings.hasAcceptedTermsOfService = true
    }

    override fun updateHasPostponedAcceptingTermsOfUsePreference() {
        settings.hasPostponedAcceptingTermsOfUse = true
    }

    override fun updateLastTermsOfUsePromptTimeInMillis(currentTimeInMillis: Long) {
        settings.lastTermsOfUsePromptTimeInMillis = currentTimeInMillis
    }

    override fun updateHasClickedTermOfUsePromptLinkPreference() {
        settings.hasClickedTermOfUsePromptLink = true
    }

    override fun updateHasClickedTermOfUsePromptRemindMeLaterPreference() {
        settings.hasClickedTermOfUsePromptRemindMeLater = true
    }

    override fun incrementTermsOfUsePromptDisplayedCount() {
        settings.termsOfUsePromptDisplayedCount++
    }
}
