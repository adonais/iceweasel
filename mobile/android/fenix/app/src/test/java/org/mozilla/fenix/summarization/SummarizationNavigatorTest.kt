/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.summarization

import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDirections
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.SessionState
import mozilla.components.concept.engine.EngineSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.summarization.eligibility.SummarizationEligibilityChecker
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SummarizationNavigatorTest {

    private lateinit var settings: SummarizationSettingsBinding
    private lateinit var eligibilityChecker: SummarizationEligibilityChecker
    private lateinit var navController: NavController

    private val featureEnabled = MutableStateFlow(true)
    private val gestureEnabled = MutableStateFlow(true)

    @Before
    fun setUp() {
        settings = mockk {
            every { isFeatureEnabled } returns featureEnabled
            every { isGestureEnabled } returns gestureEnabled
        }
        eligibilityChecker = mockk()
        navController = mockk(relaxed = true) {
            every { currentDestination } returns browserDestination()
        }
    }

    @Test
    fun `GIVEN the feature is disabled WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        featureEnabled.value = false
        val navigator = navigator(tab = eligibleTab())

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN a shake gesture but the gesture setting is disabled WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        gestureEnabled.value = false
        val navigator = navigator(tab = eligibleTab())

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = true)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN a shake gesture and the gesture setting is disabled but it is not from a shake WHEN attempting to navigate to summarization THEN navigate`() = runTest {
        gestureEnabled.value = false
        val navigator = navigator(tab = eligibleTab())

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the current tab is private WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val navigator = navigator(tab = eligibleTab(private = true))

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the current tab is loading WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val navigator = navigator(tab = eligibleTab(loading = true))

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the current destination is not the browser WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        every { navController.currentDestination } returns mockk { every { id } returns R.id.homeFragment }
        val navigator = navigator(tab = eligibleTab())

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN there is no current destination WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        every { navController.currentDestination } returns null
        val navigator = navigator(tab = eligibleTab())

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the content is not English WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val session = mockk<EngineSession>()
        coEvery { eligibilityChecker.checkLanguage(session) } returns Result.success(false)
        val navigator = navigator(tab = eligibleTab(session = session))

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN the language check fails WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val session = mockk<EngineSession>()
        coEvery { eligibilityChecker.checkLanguage(session) } returns Result.failure(RuntimeException())
        val navigator = navigator(tab = eligibleTab(session = session))

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN there is no engine session WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val navigator = navigator(tab = eligibleTab(session = null))

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        coVerify(exactly = 0) { eligibilityChecker.checkLanguage(any()) }
        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN there is no current tab WHEN attempting to navigate to summarization THEN don't navigate`() = runTest {
        val navigator = navigator(tab = null)

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify(exactly = 0) { navController.navigate(any<NavDirections>()) }
    }

    @Test
    fun `GIVEN an eligible tab WHEN attempting to navigate to summarization THEN navigates`() = runTest {
        val navigator = navigator(tab = eligibleTab())
        val directions = slot<NavDirections>()

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = false)

        verify { navController.navigate(capture(directions)) }
        assertEquals(R.id.action_browserFragment_to_summarizationFragment, directions.captured.actionId)
        assertEquals(false, directions.captured.arguments.getBoolean("fromShake"))
    }

    @Test
    fun `GIVEN an eligible tab and a shake gesture WHEN attempting to navigate to summarization THEN navigates with the shake argument`() = runTest {
        val navigator = navigator(tab = eligibleTab())
        val directions = slot<NavDirections>()

        navigator.navigateToSummarizationIfEligible(navController, fromShakeGesture = true)

        verify { navController.navigate(capture(directions)) }
        assertTrue(directions.captured.arguments.getBoolean("fromShake"))
    }

    private fun navigator(tab: SessionState?) = SummarizationNavigator(
        summarizationSettings = settings,
        eligibilityChecker = eligibilityChecker,
        getCurrentTab = { tab },
    )

    private fun browserDestination(): NavDestination = mockk {
        every { id } returns R.id.browserFragment
    }

    private fun eligibleTab(
        private: Boolean = false,
        loading: Boolean = false,
        session: EngineSession? = mockk<EngineSession>().also {
            coEvery { eligibilityChecker.checkLanguage(it) } returns Result.success(true)
        },
    ): SessionState {
        val contentState = mockk<ContentState> {
            every { this@mockk.private } returns private
            every { this@mockk.loading } returns loading
        }
        return mockk {
            every { content } returns contentState
            every { engineState } returns mockk {
                every { engineSession } returns session
            }
        }
    }
}
