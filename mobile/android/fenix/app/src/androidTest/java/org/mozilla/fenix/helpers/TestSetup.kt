/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.fenix.helpers

import mockwebserver3.MockWebServer
import mozilla.components.browser.state.store.BrowserStore
import org.junit.After
import org.junit.Before
import org.junit.Rule

/**
 * Compatibility shim kept for test classes that still extend [TestSetup].
 * All setup/teardown logic lives in [FenixTestRule].
 */
open class TestSetup {
    @get:Rule
    val fenixTestRule: FenixTestRule = FenixTestRule()

    val mockWebServer: MockWebServer get() = fenixTestRule.mockWebServer
    val browserStore: BrowserStore get() = fenixTestRule.browserStore

    @Before
    open fun setUp() = Unit

    @After
    open fun tearDown() = Unit
}
