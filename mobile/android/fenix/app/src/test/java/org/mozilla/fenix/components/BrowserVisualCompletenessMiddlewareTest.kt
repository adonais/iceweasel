package org.mozilla.fenix.components

import mozilla.components.browser.state.action.ContentAction
import mozilla.components.support.test.mock
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.utils.RunWhenReadyQueue
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class BrowserVisualCompletenessMiddlewareTest {
    @get:Rule
    val coroutineTestRule = MainCoroutineRule()

    @Test
    fun `WHEN first contentful paint occurs THEN queue is marked as ready`() {
        val queue = RunWhenReadyQueue()
        val middleware = BrowserVisualCompletenessMiddleware(queue)

        middleware.invoke(mock(), mock(), ContentAction.UpdateFirstContentfulPaintStateAction("id", true))

        assertTrue(queue.isReady())
    }
}
