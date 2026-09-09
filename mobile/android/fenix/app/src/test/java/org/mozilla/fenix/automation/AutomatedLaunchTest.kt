/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.automation

import android.content.Intent
import android.provider.Settings as AndroidSettings
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.perf.TestStrictModeManager
import org.mozilla.fenix.perf.StrictModeManager
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AutomatedLaunchTest {

    private lateinit var settings: Settings

    @Before
    fun setup() {
        settings = mockk(relaxed = true)
        every { testContext.components.settings } returns settings
        every { testContext.components.strictMode } returns TestStrictModeManager() as StrictModeManager
        setAdbEnabled(false)
    }

    @Test
    fun `GIVEN no automation extra WHEN process is called THEN startup interruptions are not disabled`() {
        AutomatedLaunch.processIntentIfPerformanceTestOrAutomation(Intent(), testContext)

        verifyNoBypass()
    }

    @Test
    fun `GIVEN automation extra AND ADB enabled WHEN process is called THEN startup interruptions are disabled`() {
        setAdbEnabled(true)
        val intent = Intent().putExtra("automationtest", true)

        AutomatedLaunch.processIntentIfPerformanceTestOrAutomation(intent, testContext)

        verifyBypass()
    }

    @Test
    fun `GIVEN automation extra AND ADB disabled WHEN process is called THEN startup interruptions are not disabled`() {
        val intent = Intent().putExtra("automationtest", true)

        AutomatedLaunch.processIntentIfPerformanceTestOrAutomation(intent, testContext)

        verifyNoBypass()
    }

    @Test
    fun `GIVEN automation extra is explicitly false WHEN process is called THEN startup interruptions are not disabled`() {
        setAdbEnabled(true)
        val intent = Intent().putExtra("automationtest", false)

        AutomatedLaunch.processIntentIfPerformanceTestOrAutomation(intent, testContext)

        verifyNoBypass()
    }

    private fun setAdbEnabled(enabled: Boolean) {
        AndroidSettings.Global.putInt(
            testContext.contentResolver,
            AndroidSettings.Global.ADB_ENABLED,
            if (enabled) 1 else 0,
        )
    }

    private fun verifyBypass() {
        verify { settings.isOverrideTPPopupsForPerformanceTest = true }
        verify { settings.shakeToSummarizeToolbarCfrShown = true }
    }

    private fun verifyNoBypass() {
        verify(exactly = 0) { settings.isOverrideTPPopupsForPerformanceTest = any() }
        verify(exactly = 0) { settings.shakeToSummarizeToolbarCfrShown = any() }
    }
}
