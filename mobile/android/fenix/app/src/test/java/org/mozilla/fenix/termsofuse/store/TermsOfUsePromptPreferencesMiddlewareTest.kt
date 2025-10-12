/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import io.mockk.mockk
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TermsOfUsePromptPreferencesMiddlewareTest {

    private lateinit var settings: Settings

    private lateinit var repository: DefaultTermsOfUsePromptRepository

    private val context = mockk<MiddlewareContext<TermsOfUsePromptState, TermsOfUsePromptAction>>(
        relaxed = true,
    )

    private lateinit var middleware: TermsOfUsePromptPreferencesMiddleware

    @Before
    fun setup() {
        settings = Settings(testContext)
        repository = DefaultTermsOfUsePromptRepository(settings)
        middleware = TermsOfUsePromptPreferencesMiddleware(repository)
    }

    @Test
    fun `WHEN the OnAcceptClicked action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnAcceptClicked(Surface.HOMEPAGE_NEW_TAB),
        )

        assertTrue(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnRemindMeLaterClicked action is received THEN the expected preferences are updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnRemindMeLaterClicked(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertTrue(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnPromptSheetManuallyDismissed action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnPromptManuallyDismissed(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnPromptDismissed action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnPromptDismissed,
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertTrue(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnLearnMoreClicked action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnLearnMoreClicked(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertTrue(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnPrivacyNoticeClicked action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnPrivacyNoticeClicked(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertTrue(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnTermsOfUseClicked action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnTermsOfUseClicked(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertTrue(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }

    @Test
    fun `WHEN the OnImpression action is received THEN the expected preference is updated`() {
        assertAllPrefsDefault()

        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnImpression(Surface.HOMEPAGE_NEW_TAB),
        )

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(1, settings.termsOfUsePromptDisplayedCount)
    }

    private fun assertAllPrefsDefault() {
        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(settings.hasClickedTermOfUsePromptLink)
        assertFalse(settings.hasClickedTermOfUsePromptRemindMeLater)
        assertFalse(settings.lastTermsOfUsePromptTimeInMillis > 0)
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
    }
}
