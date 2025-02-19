/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experimentintegration

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.helpers.HomeActivityTestRule
import org.mozilla.fenix.helpers.TestHelper
import org.mozilla.fenix.ui.robots.homeScreen

class GenericExperimentIntegrationTest {
    private val experimentName = InstrumentationRegistry.getArguments().getString("EXP_NAME", "Viewpoint")

    @get:Rule
    val activityTestRule = HomeActivityTestRule(
        isPWAsPromptEnabled = false,
    )

    @Before
    fun setUp() {
        TestHelper.appContext.settings().showSecretDebugMenuThisSession = true
    }

    @After
    fun tearDown() {
        TestHelper.appContext.settings().showSecretDebugMenuThisSession = false
    }

    @Test
    fun disableStudiesViaStudiesToggle() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openExperimentsMenu {
            verifyExperimentEnrolled(experimentName)
        }.goBack {
        }.openSettingsSubMenuDataCollection {
            clickStudiesOption()
            verifyStudiesToggle(true)
            clickStudiesToggle()
            clickStudiesDialogOkButton()
        }
    }

    @Test
    fun verifyStudiesAreDisabled() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openSettingsSubMenuDataCollection {
            clickStudiesOption()
            verifyStudiesToggle(false)
        }
    }

    @Test
    fun testExperimentEnrolled() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openExperimentsMenu {
            verifyExperimentEnrolled(experimentName)
        }
    }

    @Test
    fun testExperimentUnenrolled() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openExperimentsMenu {
            verifyExperimentExists(experimentName)
            verifyExperimentNotEnrolled(experimentName)
        }
    }

    @Test
    fun testExperimentUnenrolledViaSecretMenu() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openExperimentsMenu {
            verifyExperimentExists(experimentName)
            verifyExperimentEnrolled(experimentName)
            unenrollfromExperiment(experimentName)
            verifyExperimentNotEnrolled(experimentName)
        }
    }
}
