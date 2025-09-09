/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import org.mozilla.fenix.utils.Settings

/**
 * Repository for preferences related to the terms of use bottom sheet
 */
interface TermsOfUsePromptRepository {
    /**
     * Updates the hasAcceptedTermsOfService preference to true
     */
    fun updateHasAcceptedTermsOfUsePreference()

    /**
     * Updates the hasPostponedAcceptingTermsOfService preference to true
     */
    fun updateHasPostponedAcceptingTermsOfUsePreference()

    /**
     * Updates the lastTermsOfUsePromptTimeInMillis preference to the current time
     *
     * @param time the current time in milliseconds
     */
    fun updateLastTermsOfUsePromptTimeInMillis(time: Long = System.currentTimeMillis())
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

    override fun updateLastTermsOfUsePromptTimeInMillis(time: Long) {
        settings.lastTermsOfUsePromptTimeInMillis = time
    }
}
