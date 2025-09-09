/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import io.mockk.every
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TermsOfUseManagerTest {

    private lateinit var settings: Settings
    private lateinit var termsOfUseManager: TermsOfUseManager

    @Before
    fun setup() {
        settings = Settings(testContext)
        termsOfUseManager = TermsOfUseManager(settings)
        every { testContext.settings() } returns settings
    }

    @Test
    fun `GIVEN the user has not accepted terms of use THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = true

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN the user has not postponed accepting THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = false
        termsOfUseManager.onStart()

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN the user has postponed accepting AND it has been 5 days since THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = true
        termsOfUseManager.onStart()
        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis() - Settings.FIVE_DAYS_MS

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN the user has postponed accepting AND it has not been 5 days since THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = true
        termsOfUseManager.onStart()
        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis()

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN this is the first check of the session AND other requirements are met THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = false
        termsOfUseManager.onStart()

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN this is not the first check of the session AND other requirements are met THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = false
        termsOfUseManager.onStart()

        termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment()

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN this is not the first check of the session AND we ignore the first check AND other requirements are met THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = false
        termsOfUseManager.onStart()

        termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment()

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePromptOnHomepage())
    }

    @Test
    fun `GIVEN the first check was before 5 days WHEN we check again after 5 days on the Browser Fragment without restarting AND other requirements are met THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = true
        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis()
        termsOfUseManager.onStart()

        termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment()

        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis() - Settings.FIVE_DAYS_MS

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment())
    }

    @Test
    fun `GIVEN the first check was before 5 days WHEN we check again after 5 days on the Home Fragment without restarting AND other requirements are met THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfUse = true
        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis()
        termsOfUseManager.onStart()

        termsOfUseManager.shouldShowTermsOfUsePromptOnBrowserFragment()

        settings.lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis() - Settings.FIVE_DAYS_MS

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePromptOnHomepage())
    }
}
