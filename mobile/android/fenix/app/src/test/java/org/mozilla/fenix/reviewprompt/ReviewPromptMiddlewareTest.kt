/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.reviewprompt.ReviewPromptState.Eligible.Type
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class ReviewPromptMiddlewareTest {

    private val settings = Settings(testContext).apply {
        numberOfAppLaunches = 5
        isDefaultBrowser = true
        lastReviewPromptTimeInMillis = 0L
    }

    private lateinit var triggers: Sequence<Boolean>

    private val store = AppStore(
        middlewares = listOf(
            ReviewPromptMiddleware(
                settings = settings,
                timeNowInMillis = { TEST_TIME_NOW },
                triggers = { triggers },
            ),
        ),
    )

    @Test
    fun `GIVEN prompt has never been shown AND a trigger is satisfied WHEN check requested THEN sets eligible`() {
        triggers = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN prompt has never been shown AND the first trigger is satisfied WHEN check requested THEN sets eligible`() {
        triggers = sequenceOf(true, false, false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN prompt has never been shown AND the first trigger is satisfied WHEN check requested THEN other triggers are not checked`() {
        var checkedOtherTriggers = false
        triggers = sequence {
            yield(true)
            checkedOtherTriggers = true
            yield(true)
        }

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertFalse(checkedOtherTriggers)
    }

    @Test
    fun `GIVEN prompt has never been shown AND one of the triggers is satisfied WHEN check requested THEN sets eligible`() {
        triggers = sequenceOf(false, false, true, false, false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN prompt has never been shown AND no triggers are satisfied WHEN check requested THEN sets not eligible`() {
        triggers = sequenceOf(false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN prompt has never been shown AND there are no triggers WHEN check requested THEN sets not eligible`() {
        triggers = emptySequence()

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN prompt has been shown more than 4 months ago AND a trigger is satisfied WHEN check requested THEN sets eligible`() {
        settings.lastReviewPromptTimeInMillis = MORE_THAN_4_MONTHS_FROM_TEST_TIME_NOW
        triggers = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN prompt has been shown less than 4 months ago WHEN check requested THEN sets not eligible`() {
        settings.lastReviewPromptTimeInMillis = LESS_THAN_4_MONTHS_FROM_TEST_TIME_NOW

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN check ran WHEN check requested again THEN does nothing`() {
        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()
        val expectedState = store.state

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `GIVEN review prompt shown WHEN check requested THEN does nothing`() {
        store.dispatch(ReviewPromptAction.ReviewPromptShown).joinBlocking()
        val expectedState = store.state

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN review prompt shown THEN last review prompt time updated`() {
        store.dispatch(ReviewPromptAction.ReviewPromptShown).joinBlocking()

        assertEquals(TEST_TIME_NOW, settings.lastReviewPromptTimeInMillis)
    }

    @Test
    fun `WHEN don't show review prompt THEN does nothing`() {
        assertNoOp(ReviewPromptAction.DoNotShowReviewPrompt)
    }

    @Test
    fun `WHEN show custom prompt THEN does nothing`() {
        assertNoOp(ReviewPromptAction.ShowCustomReviewPrompt)
    }

    @Test
    fun `WHEN show Play Store prompt THEN does nothing`() {
        assertNoOp(ReviewPromptAction.ShowPlayStorePrompt)
    }

    @Test
    fun `GIVEN telemetry enabled AND a trigger is satisfied WHEN check requested THEN sets eligible for Custom prompt`() {
        settings.isTelemetryEnabled = true
        triggers = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.Eligible(Type.Custom)),
            store.state,
        )
    }

    @Test
    fun `GIVEN telemetry disabled AND a trigger is satisfied WHEN check requested THEN sets eligible for Play Store prompt`() {
        settings.isTelemetryEnabled = false
        triggers = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.Eligible(Type.PlayStore)),
            store.state,
        )
    }

    @Test
    fun `WHEN app is the default browser AND was launched at least 5 times THEN legacy trigger is satisfied`() {
        assertTrue(legacyReviewPromptTrigger(settings))
    }

    @Test
    fun `WHEN app isn't the default browser THEN legacy trigger is not satisfied`() {
        settings.isDefaultBrowser = false

        assertFalse(legacyReviewPromptTrigger(settings))
    }

    @Test
    fun `WHEN app was launched less than 5 times THEN legacy trigger is not satisfied`() {
        settings.numberOfAppLaunches = 4

        assertFalse(legacyReviewPromptTrigger(settings))
    }

    private fun assertNoOp(action: ReviewPromptAction) {
        val withoutMiddleware = AppStore()
        withoutMiddleware.dispatch(action).joinBlocking()
        val expectedState = withoutMiddleware.state

        store.dispatch(action).joinBlocking()

        assertEquals(
            expectedState,
            store.state,
        )
    }

    companion object {
        private const val TEST_TIME_NOW = 1598416882805L
        private const val MORE_THAN_4_MONTHS_FROM_TEST_TIME_NOW = 1588048882804L
        private const val LESS_THAN_4_MONTHS_FROM_TEST_TIME_NOW = 1595824882905L
    }
}
