/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import android.content.res.Configuration
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.helpers.EfficiencyExecutionRequirements
import org.mozilla.fenix.ui.efficiency.helpers.MockWebServerRequirement
import org.mozilla.fenix.ui.efficiency.helpers.RequiredOrientation

@RunWith(AndroidJUnit4::class)
class EfficiencyExecutionContractTest : BaseTest() {
    @Test
    fun defaultContractOwnsLaunchEnvironmentAndMockServer() {
        assertEquals(RequiredOrientation.PORTRAIT, currentExecutionContext.requirements.orientation)
        assertEquals(Configuration.ORIENTATION_PORTRAIT, composeRule.activity.resources.configuration.orientation)
        assertEquals("AVAILABLE", currentExecutionContext.asMeta()["mockWebServer"])
        assertEquals("http", mockWebServer.url("/").scheme)
    }
}

@RunWith(AndroidJUnit4::class)
class LandscapeExecutionContractTest :
    BaseTest(
        defaultExecutionRequirements =
            EfficiencyExecutionRequirements(
                orientation = RequiredOrientation.LANDSCAPE,
                mockWebServer = MockWebServerRequirement.NOT_NEEDED,
            )
    ) {
    @Test
    fun orientationRequirementIsOverridable() {
        assertEquals(RequiredOrientation.LANDSCAPE, currentExecutionContext.requirements.orientation)
        assertEquals(Configuration.ORIENTATION_LANDSCAPE, composeRule.activity.resources.configuration.orientation)
    }
}
