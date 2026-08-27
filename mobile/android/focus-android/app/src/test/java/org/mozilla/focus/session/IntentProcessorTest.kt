/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.session

import android.content.Context
import android.content.Intent
import mozilla.components.browser.state.selector.allTabs
import mozilla.components.concept.engine.EngineSession
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.utils.toSafeIntent
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.focus.TestFocusApplication
import org.mozilla.focus.ext.components
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = TestFocusApplication::class)
class IntentProcessorTest {
    private lateinit var context: Context
    private lateinit var intentProcessor: IntentProcessor

    @Before
    fun setup() {
        context = testContext
        intentProcessor = IntentProcessor(
            context,
            context.components.tabsUseCases,
            context.components.customTabsUseCases,
            context.components.searchUseCases,
        )
    }

    @Test
    fun `GIVEN an ACTION_VIEW intent WHEN handling the intent THEN create a tab with LoadUrlFlags EXTERNAL`() {
        val browserStore = context.components.store
        val url = "https://mozilla.org"
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = android.net.Uri.parse(url)
        }

        intentProcessor.handleIntent(intent.toSafeIntent(), null)

        assertEquals(1, browserStore.state.allTabs.size)

        val tab = browserStore.state.allTabs[0]

        assertEquals(url, tab.content.url)
        assertEquals(EngineSession.LoadUrlFlags.external().value, tab.engineState.initialLoadFlags.value)
    }

    @Test
    fun `GIVEN an ACTION_SEND intent WHEN handling the intent THEN create a tab with LoadUrlFlags EXTERNAL`() {
        val browserStore = context.components.store
        val url = "https://mozilla.org"
        val intent = Intent(Intent.ACTION_SEND).apply {
            putExtra(Intent.EXTRA_TEXT, url)
        }

        intentProcessor.handleIntent(intent.toSafeIntent(), null)

        assertEquals(1, browserStore.state.allTabs.size)

        val tab = browserStore.state.allTabs[0]

        assertEquals(url, tab.content.url)
        assertEquals(EngineSession.LoadUrlFlags.external().value, tab.engineState.initialLoadFlags.value)
    }
}
