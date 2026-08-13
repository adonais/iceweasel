/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.settings

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mozilla.components.lib.shake.ShakeSensitivity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class PageSummariesSettingsMiddlewareTest {

    private var learnMoreClicked = false

    @Before
    fun setup() {
        learnMoreClicked = false
    }

    @Test
    fun `WHEN summarize pages is toggled on THEN feature is enabled `() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = false,
            isGestureEnabled = false,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(SummarizePagesPreferenceToggled)
        this.runCurrent()

        assertTrue(settings.getFeatureEnabledUserStatus().first() == true)
    }

    @Test
    fun `WHEN summarize pages is toggled off THEN feature is disabled`() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = true,
            isGestureEnabled = false,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(SummarizePagesPreferenceToggled)
        this.runCurrent()

        assertFalse(settings.getFeatureEnabledUserStatus().first() == true)
    }

    @Test
    fun `WHEN shake to summarize is toggled on THEN gesture is enabled`() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = true,
            isGestureEnabled = false,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(ShakeToSummarizePreferenceToggled)
        this.runCurrent()

        assertTrue(settings.getFeatureEnabledUserStatus().first() == true)
    }

    @Test
    fun `WHEN shake to summarize is toggled off THEN gesture is disabled`() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = true,
            isGestureEnabled = true,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(ShakeToSummarizePreferenceToggled)
        this.runCurrent()

        assertFalse(settings.getGestureEnabledUserStatus().first())
    }

    @Test
    fun `WHEN page summaries are toggled off THEN gesture preference is preserved`() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = true,
            isGestureEnabled = true,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(SummarizePagesPreferenceToggled)
        this.runCurrent()

        assertFalse(settings.getFeatureEnabledUserStatus().first() == true)
        assertTrue(settings.getGestureEnabledUserStatus().first())
    }

    @Test
    fun `WHEN shake sensitivity is changed THEN it is persisted`() = runTest {
        val settings = SummarizationSettings.inMemory(
            isFeatureEnabled = true,
            isGestureEnabled = true,
        )
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(ShakeSensitivityChanged(ShakeSensitivity.Low))
        this.runCurrent()

        assertEquals(ShakeSensitivity.Low, settings.getShakeSensitivity().first())
    }

    @Test
    fun `WHEN view appears THEN saved sensitivity is loaded in state`() = runTest {
        val settings = SummarizationSettings.inMemory(shakeSensitivity = ShakeSensitivity.High)
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        assertEquals(ShakeSensitivity.High, store.state.shakeSensitivity)
    }

    @Test
    fun `WHEN learn more is clicked THEN callback is invoked`() = runTest {
        val settings = SummarizationSettings.inMemory()
        val middleware = buildMiddleware(settings, this)
        val store = middleware.makeStore()

        store.dispatch(ViewAppeared)
        this.runCurrent()

        store.dispatch(LearnMoreClicked)
        this.runCurrent()

        assertTrue(learnMoreClicked)
    }

    private fun buildMiddleware(
        settings: SummarizationSettings,
        scope: CoroutineScope,
    ) = SummarizeSettingsMiddleware(
        settings = settings,
        onLearnMoreClicked = { learnMoreClicked = true },
        scope = scope,
    )

    private fun SummarizeSettingsMiddleware.makeStore() = SummarizeSettingsStore(
        initialState = SummarizeSettingsState(),
        reducer = ::summarizeSettingsReducer,
        middleware = listOf(this),
    )
}
