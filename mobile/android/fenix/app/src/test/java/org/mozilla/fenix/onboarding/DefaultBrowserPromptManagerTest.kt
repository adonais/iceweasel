/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.fenix.onboarding

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.nimbus.DefaultBrowserPrompt
import org.mozilla.fenix.nimbus.FxNimbus.features
import org.mozilla.fenix.onboarding.view.OnboardingPageUiData
import org.mozilla.fenix.onboarding.view.defaultBrowserPageUiData
import org.mozilla.fenix.onboarding.view.notificationPageUiData
import org.mozilla.fenix.onboarding.view.syncPageUiData
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DefaultBrowserPromptManagerTest {

    private lateinit var settings: Settings

    @Before
    fun setup() {
        settings = Settings(testContext)
        enableDefaultBrowserPromptFeature()
    }

    @Test
    fun `WHEN browser is already default THEN can not show the prompt`() {
        val promptManager = DefaultBrowserPromptManager(
            storage = buildStorage(isDefaultBrowser = true),
            settings = { settings },
            promptToSetAsDefaultBrowser = {},
        )

        assertFalse(promptManager.canShowPrompt())
    }

    @Test
    fun `WHEN prompt is already displayed THEN can not show it`() {
        val promptManager = DefaultBrowserPromptManager(
            storage = buildStorage(promptToSetAsDefaultBrowserDisplayedInOnboarding = true),
            settings = { settings },
            promptToSetAsDefaultBrowser = {},
        )

        assertFalse(promptManager.canShowPrompt())
    }

    @Test
    fun `WHEN prompt is not supported THEN we can not show it`() {
        val promptManager = DefaultBrowserPromptManager(
            storage = buildStorage(isDefaultBrowserPromptSupported = false),
            settings = { settings },
            promptToSetAsDefaultBrowser = {},
        )

        assertFalse(promptManager.canShowPrompt())
    }

    @Test
    fun `WHEN default browser prompt feature flag is disabled THEN can not show the prompt`() {
        val disabledFeature = DefaultBrowserPrompt(enabled = false)

        assertFalse(settings.shouldShowSetAsDefaultPrompt(disabledFeature))
    }

    @Test
    fun `WHEN we can show prompt THEN only the set to default card shows the prompt`() {
        assertTrue(promptShownFor(defaultBrowserPageUiData))
        assertFalse(promptShownFor(syncPageUiData))
        assertFalse(promptShownFor(notificationPageUiData))
    }

    private fun promptShownFor(currentCard: OnboardingPageUiData): Boolean {
        var promptToSetAsDefaultBrowserCalled = false
        val promptManager = DefaultBrowserPromptManager(
            storage = buildStorage(),
            settings = { settings },
            promptToSetAsDefaultBrowser = { promptToSetAsDefaultBrowserCalled = true },
        )

        assertTrue(promptManager.canShowPrompt())

        promptManager.maybePromptToSetAsDefaultBrowser(currentCard)

        return promptToSetAsDefaultBrowserCalled
    }

    private fun buildStorage(
        isDefaultBrowser: Boolean = false,
        isDefaultBrowserPromptSupported: Boolean = true,
        promptToSetAsDefaultBrowserDisplayedInOnboarding: Boolean = false,
    ) = object : DefaultBrowserPromptStorage {
        override val isDefaultBrowser: Boolean = isDefaultBrowser
        override val isDefaultBrowserPromptSupported: Boolean = isDefaultBrowserPromptSupported
        override var promptToSetAsDefaultBrowserDisplayedInOnboarding = promptToSetAsDefaultBrowserDisplayedInOnboarding
    }

    private fun enableDefaultBrowserPromptFeature() {
        val enabledFeature = DefaultBrowserPrompt(
            enabled = true,
            daysBetweenPrompts = null,
            maxPromptsShown = null,
            coldStartsBetweenPrompts = null,
        )
        features.defaultBrowserPrompt.withCachedValue(enabledFeature)
    }
}
