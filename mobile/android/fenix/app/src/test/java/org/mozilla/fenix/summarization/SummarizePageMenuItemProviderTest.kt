/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.summarization

import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.EngineState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.compose.menu.ui.MenuItemState
import mozilla.components.concept.engine.EngineSession
import mozilla.components.ui.icons.R as iconsR
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.summarization.eligibility.SummarizationEligibilityChecker
import org.mozilla.fenix.summarization.onboarding.SummarizationFeatureDiscoveryConfiguration

@OptIn(ExperimentalCoroutinesApi::class)
class SummarizePageMenuItemProviderTest {
    @Test
    fun `GIVEN the feature is not available WHEN providing the item THEN don't show it`() = runTest {
        val provider = provider(settings = settings(showMenuItem = false))

        assertNull(provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the page was not checked yet WHEN providing the item THEN show summarizing as not available`() =
        runTest {
            val provider = provider()

            assertEquals(summarizePageItem(isEnabled = false), provider.itemFlow.value)
        }

    @Test
    fun `WHEN the page can be summarized THEN allow summarizing it`() = runTest {
        val provider = provider(eligibilityChecker = eligibilityChecker(isEligible = true))

        runCurrent()

        assertEquals(summarizePageItem(isEnabled = true), provider.itemFlow.value)
    }

    @Test
    fun `WHEN the page cannot be summarized THEN keep summarizing as not available`() = runTest {
        val provider = provider(eligibilityChecker = eligibilityChecker(isEligible = false))

        runCurrent()

        assertEquals(summarizePageItem(isEnabled = false), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN a private page WHEN providing the item THEN don't allow summarizing it`() = runTest {
        val provider =
            provider(
                browserStore = browserStore(isPrivate = true),
                eligibilityChecker = eligibilityChecker(isEligible = true),
            )

        runCurrent()

        assertEquals(summarizePageItem(isEnabled = false, isHighlighted = false), provider.itemFlow.value)
    }

    @Test
    fun `GIVEN the feature is to be highlighted WHEN providing the item THEN highlight its icon`() = runTest {
        val provider = provider(settings = settings(shouldHighlightMenuItem = true))

        assertEquals(summarizePageItem(isEnabled = false, isHighlighted = true), provider.itemFlow.value)
    }

    // The item is kept up to date, and the page checked, on a scope that runTest cancels at the end of each test.
    private fun TestScope.provider(
        browserStore: BrowserStore = browserStore(),
        settings: SummarizationFeatureDiscoveryConfiguration = settings(),
        eligibilityChecker: SummarizationEligibilityChecker = eligibilityChecker(isEligible = false),
    ) =
        SummarizePageMenuItemProvider(
            browserStore = browserStore,
            summarizationSettings = settings,
            eligibilityChecker = eligibilityChecker,
            scope = backgroundScope,
        )

    private fun browserStore(isPrivate: Boolean = false) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content = ContentState(url = "https://mozilla.org", private = isPrivate),
                            engineState = EngineState(engineSession = mockk<EngineSession>(relaxed = true)),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun settings(
        showMenuItem: Boolean = true,
        shouldHighlightMenuItem: Boolean = false,
    ): SummarizationFeatureDiscoveryConfiguration = mockk {
        every { this@mockk.showMenuItem } returns showMenuItem
        every { this@mockk.shouldHighlightMenuItem } returns shouldHighlightMenuItem
    }

    private fun eligibilityChecker(isEligible: Boolean): SummarizationEligibilityChecker = mockk {
        coEvery { checkLanguage(any()) } returns Result.success(isEligible)
    }

    private fun summarizePageItem(
        isEnabled: Boolean,
        isHighlighted: Boolean = false,
    ) =
        StandardMenuItem(
            title = Text.Resource(R.string.browser_menu_summarize_page),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_lightning_24, isHighlighted = isHighlighted),
            onClickEvent = MenuAction.Navigate.Summarizer,
            onShownEvent = MenuAction.OnSummarizationMenuExposed,
            showNewIndicator = true,
            state =
                when (isEnabled) {
                    true -> MenuItemState.DEFAULT
                    else -> MenuItemState.DISABLED
                },
        )

    private companion object {
        const val TAB_ID = "tab1"
    }
}
