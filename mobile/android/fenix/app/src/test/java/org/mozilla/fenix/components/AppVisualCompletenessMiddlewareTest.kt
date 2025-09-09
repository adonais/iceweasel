package org.mozilla.fenix.components

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.mock
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.utils.RunWhenReadyQueue
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.components.appstate.AppAction

class AppVisualCompletenessMiddlewareTest {
    @get:Rule
    val coroutineTestRule = MainCoroutineRule()

    @Test
    fun `WHEN first frame of home screen is drawn THEN queue is marked as ready`() {
        val queue = RunWhenReadyQueue()
        val middleware = AppVisualCompletenessMiddleware(queue)

        middleware.invoke(mock(), mock(), AppAction.UpdateFirstFrameDrawn(true))

        assertTrue(queue.isReady())
    }

    @Test
    fun `WHEN home screen is never drawn THEN queue is marked as ready after five seconds`() = runTest {
        val queue = RunWhenReadyQueue()
        val middleware = AppVisualCompletenessMiddleware(queue, this)
        middleware.invoke(mock(), mock(), AppAction.AppLifecycleAction.ResumeAction)

        this.advanceUntilIdle()

        assertTrue(queue.isReady())
    }
}
