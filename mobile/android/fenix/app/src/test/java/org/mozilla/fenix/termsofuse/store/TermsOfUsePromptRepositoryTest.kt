/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TermsOfUsePromptRepositoryTest {

    private lateinit var settings: Settings

    private lateinit var repository: DefaultTermsOfUsePromptRepository

    @Before
    fun setup() {
        settings = Settings(testContext)
        repository = DefaultTermsOfUsePromptRepository(settings)
    }

    @Test
    fun `WHEN updateHasAcceptedTermsOfUsePreference is called THEN the preference is updated`() {
        assertFalse(settings.hasAcceptedTermsOfService)
        repository.updateHasAcceptedTermsOfUsePreference()
        assertTrue(settings.hasAcceptedTermsOfService)
    }

    @Test
    fun `WHEN updateHasPostponedAcceptingTermsOfUsePreference is called THEN the preference is updated`() {
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        repository.updateHasPostponedAcceptingTermsOfUsePreference()
        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN updateLastTermsOfUsePromptTimeInMillis is called THEN the preference is updated`() {
        assertEquals(settings.lastTermsOfUsePromptTimeInMillis, 0)
        repository.updateLastTermsOfUsePromptTimeInMillis()
        assertTrue(settings.lastTermsOfUsePromptTimeInMillis > 0)
    }
}
