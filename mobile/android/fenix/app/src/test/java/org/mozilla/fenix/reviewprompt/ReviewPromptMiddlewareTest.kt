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
import org.mozilla.experiments.nimbus.NimbusMessagingHelperInterface
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.ReviewPromptAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.reviewprompt.ReviewPromptState.Eligible.Type
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class ReviewPromptMiddlewareTest {

    private val settings = Settings(testContext)

    private lateinit var mainCriteria: Sequence<Boolean>
    private lateinit var subCriteria: Sequence<Boolean>

    private val store = AppStore(
        middlewares = listOf(
            ReviewPromptMiddleware(
                settings = settings,
                createJexlHelper = {
                    object : NimbusMessagingHelperInterface {
                        override fun evalJexl(expression: String) = assertUnused()
                        override fun getUuid(template: String) = assertUnused()
                        override fun stringFormat(template: String, uuid: String?) = assertUnused()
                    }
                },
                timeNowInMillis = { TEST_TIME_NOW },
                buildTriggerMainCriteria = { mainCriteria },
                buildTriggerSubCriteria = { subCriteria },
            ),
        ),
    )

    @Test
    fun `GIVEN main criteria satisfied AND one of sub-criteria satisfied WHEN check requested THEN sets eligible`() {
        mainCriteria = sequenceOf(true)
        subCriteria = sequenceOf(false, true, false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN main criteria satisfied AND first sub-criteria satisfied WHEN check requested THEN other sub-criteria are not checked`() {
        mainCriteria = sequenceOf(true)
        var continuedPastFirstSatisfied = false
        subCriteria = sequence {
            yield(true)
            continuedPastFirstSatisfied = true
            yield(true)
        }

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertFalse(continuedPastFirstSatisfied)
    }

    @Test
    fun `GIVEN no main criteria AND one of sub-criteria satisfied WHEN check requested THEN sets eligible`() {
        mainCriteria = emptySequence()
        subCriteria = sequenceOf(false, true, false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertTrue(store.state.reviewPrompt is ReviewPromptState.Eligible)
    }

    @Test
    fun `GIVEN main criteria satisfied AND no sub-criteria satisfied WHEN check requested THEN sets not eligible`() {
        mainCriteria = sequenceOf(true)
        subCriteria = sequenceOf(false)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN main criteria satisfied AND no sub-criteria WHEN check requested THEN sets not eligible`() {
        mainCriteria = sequenceOf(true)
        subCriteria = emptySequence()

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN one of main criteria not satisfied AND sub-criteria satisfied WHEN check requested THEN sets not eligible`() {
        mainCriteria = sequenceOf(true, false, true)
        subCriteria = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.NotEligible),
            store.state,
        )
    }

    @Test
    fun `GIVEN one of main criteria not satisfied WHEN check requested THEN other criteria not checked`() {
        var continuedPastFirstNotSatisfied = false
        mainCriteria = sequence {
            yield(false)
            continuedPastFirstNotSatisfied = true
            yield(false)
        }
        subCriteria = sequence {
            continuedPastFirstNotSatisfied = true
            yield(false)
        }

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertFalse(continuedPastFirstNotSatisfied)
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
    fun `GIVEN telemetry enabled AND criteria satisfied WHEN check requested THEN sets eligible for Custom prompt`() {
        settings.isTelemetryEnabled = true
        mainCriteria = sequenceOf(true)
        subCriteria = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.Eligible(Type.Custom)),
            store.state,
        )
    }

    @Test
    fun `GIVEN telemetry disabled AND criteria satisfied WHEN check requested THEN sets eligible for Play Store prompt`() {
        settings.isTelemetryEnabled = false
        mainCriteria = sequenceOf(true)
        subCriteria = sequenceOf(true)

        store.dispatch(ReviewPromptAction.CheckIfEligibleForReviewPrompt).joinBlocking()

        assertEquals(
            AppState(reviewPrompt = ReviewPromptState.Eligible(Type.PlayStore)),
            store.state,
        )
    }

    @Test
    fun `WHEN evalJexl returns false THEN createdAtLeastOneBookmark returns false`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(false)

        val result = createdAtLeastOneBookmark(jexlHelper)

        assertEquals(jexlHelper.evalJexlValue, result)
    }

    @Test
    fun `WHEN evalJexl returns true THEN createdAtLeastOneBookmark returns true`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(true)

        val result = createdAtLeastOneBookmark(jexlHelper)

        assertEquals(jexlHelper.evalJexlValue, result)
    }

    @Test
    fun `WHEN evalJexl returns false THEN isDefaultBrowserTrigger returns false`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(false)

        val result = isDefaultBrowserTrigger(jexlHelper)

        assertFalse(result)
    }

    @Test
    fun `WHEN evalJexl returns true THEN isDefaultBrowserTrigger returns true`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(true)

        val result = isDefaultBrowserTrigger(jexlHelper)

        assertTrue(result)
    }

    @Test
    fun `WHEN evalJexl returns false THEN usedAppOnAtLeastFourOfLastSevenDaysTrigger returns false`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(false)

        val result = usedAppOnAtLeastFourOfLastSevenDaysTrigger(jexlHelper)

        assertFalse(result)
    }

    @Test
    fun `WHEN evalJexl returns true THEN usedAppOnAtLeastFourOfLastSevenDaysTrigger returns true`() {
        val jexlHelper = FakeNimbusMessagingHelperInterface(true)

        val result = usedAppOnAtLeastFourOfLastSevenDaysTrigger(jexlHelper)

        assertTrue(result)
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

    private fun assertUnused(): Nothing =
        throw AssertionError("Expected unused function, but was called here ")

    private companion object {
        const val TEST_TIME_NOW = 1598416882805L
    }

    private class FakeNimbusMessagingHelperInterface(val evalJexlValue: Boolean) :
        NimbusMessagingHelperInterface {
        override fun evalJexl(expression: String): Boolean = evalJexlValue
        override fun getUuid(template: String): String? = null
        override fun stringFormat(template: String, uuid: String?): String = ""
    }
}
