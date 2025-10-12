/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import org.hamcrest.Matchers.equalTo
import org.junit.Assume.assumeThat
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.geckoview.GeckoRuntimeSettings

@RunWith(AndroidJUnit4::class)
@MediumTest
class IsolatedProcessTest : BaseSessionTest() {
    @Test
    fun isolatedProcessSetting() {
        val settingsEnabled = GeckoRuntimeSettings.Builder().isolatedProcessEnabled(true).build()

        assertTrue(
            "Isolated content process should be enabled by settings",
            settingsEnabled.isolatedProcessEnabled,
        )

        val settingsDisabled = GeckoRuntimeSettings.Builder().isolatedProcessEnabled(false).build()
        assertFalse(
            "Isolated content process should be disabled by settings",
            settingsDisabled.isolatedProcessEnabled,
        )
    }

    @Test
    fun isolatedProcessEnabled() {
        assumeThat(sessionRule.env.isIsolatedProcess, equalTo(true))

        assertTrue(
            "Isolated content process is enabled on runtime settings",
            sessionRule.runtime.settings.isolatedProcessEnabled,
        )
    }

    @Test
    fun isolatedProcessDisabled() {
        assumeThat(sessionRule.env.isIsolatedProcess, equalTo(false))

        assertFalse(
            "Isolated content process is disabled on runtime settings",
            sessionRule.runtime.settings.isolatedProcessEnabled,
        )
    }
}
