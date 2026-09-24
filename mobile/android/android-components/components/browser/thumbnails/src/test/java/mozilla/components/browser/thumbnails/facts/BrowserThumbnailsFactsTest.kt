/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails.facts

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.processor.CollectionProcessor
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BrowserThumbnailsFactsTest {

    @Test
    fun `emitBrowserThumbnailsFact routes through the Facts framework`() {
        CollectionProcessor.withFactCollection { facts ->
            emitBrowserThumbnailsFact(
                action = Action.IMPLEMENTATION_DETAIL,
                item = BrowserThumbnailsFacts.Items.CAPTURE_ATTEMPTED,
                value = BrowserThumbnailsFacts.CaptureAttemptedTriggers.LOAD_COMPLETED,
            )

            assertEquals(1, facts.size)
            with(facts.single()) {
                assertEquals(Component.BROWSER_THUMBNAILS, component)
                assertEquals(Action.IMPLEMENTATION_DETAIL, action)
                assertEquals(BrowserThumbnailsFacts.Items.CAPTURE_ATTEMPTED, item)
                assertEquals(BrowserThumbnailsFacts.CaptureAttemptedTriggers.LOAD_COMPLETED, value)
            }
        }
    }

    @Test
    fun `emitBrowserThumbnailsFact forwards metadata`() {
        CollectionProcessor.withFactCollection { facts ->
            emitBrowserThumbnailsFact(
                action = Action.IMPLEMENTATION_DETAIL,
                item = BrowserThumbnailsFacts.Items.CAPTURE_ATTEMPTED,
                value = BrowserThumbnailsFacts.CaptureAttemptedTriggers.EXTERNAL_REQUEST,
                metadata = mapOf("k" to "v"),
            )

            assertEquals(mapOf("k" to "v"), facts.single().metadata)
        }
    }
}
