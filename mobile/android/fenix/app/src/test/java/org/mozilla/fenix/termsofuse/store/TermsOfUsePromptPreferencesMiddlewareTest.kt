/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import io.mockk.mockk
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
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
    fun `WHEN the OnAcceptClicked action is received THEN the preference will be updated`() {
        assertFalse(settings.hasAcceptedTermsOfService)
        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnAcceptClicked,
        )

        assertTrue(settings.hasAcceptedTermsOfService)
    }

    @Test
    fun `WHEN the OnNotNowClicked action is received THEN the preference will be updated`() {
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnNotNowClicked,
        )

        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN the OnPromptSheetManuallyDismissed action is received THEN the preference will be updated`() {
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnPromptManuallyDismissed,
        )

        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN the OnPromptDismissed action is received THEN the preference will be updated`() {
        assertEquals(settings.lastTermsOfUsePromptTimeInMillis, 0)
        middleware.invoke(
            context = context,
            next = {},
            action = TermsOfUsePromptAction.OnPromptDismissed,
        )

        assertTrue(settings.lastTermsOfUsePromptTimeInMillis > 0)
    }
}
