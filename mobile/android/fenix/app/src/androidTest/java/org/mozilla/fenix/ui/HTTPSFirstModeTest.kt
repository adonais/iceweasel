/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.navigationToolbar

class HTTPSFirstModeTest : TestSetup() {
    @get:Rule
    val activityTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    @Test
    fun httpsFirstModeImplicitSchemeTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser("permission.site".toUri()) {
            verifyPageContent("permission.site")
        }.openNavigationToolbar {
            verifyUrl("https://permission.site/")
        }
    }

    @Test
    fun httpsFirstModeExplicitSchemeTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser("http://permission.site".toUri()) {
            verifyPageContent("permission.site")
        }.openNavigationToolbar {
            verifyUrl("http://permission.site/")
        }

        // Exception should persist
        navigationToolbar {
        }.enterURLAndEnterToBrowser("permission.site".toUri()) {
            verifyPageContent("permission.site")
        }.openNavigationToolbar {
            verifyUrl("http://permission.site/")
        }
    }
}
