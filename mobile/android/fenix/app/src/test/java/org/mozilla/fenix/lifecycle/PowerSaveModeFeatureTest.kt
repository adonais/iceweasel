/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.lifecycle

import android.content.Intent
import android.os.Looper.getMainLooper
import android.os.PowerManager
import androidx.test.core.app.ApplicationProvider
import mozilla.components.support.base.android.PowerManagerInfoProvider
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.PowerSavingMode
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class PowerSaveModeFeatureTest {

    @get:Rule val gleanRule = FenixGleanTestRule(ApplicationProvider.getApplicationContext())

    private val appStore = AppStore()

    private lateinit var settings: Settings

    private class FakePowerManagerInfoProvider(var powerSaveMode: Boolean = false) : PowerManagerInfoProvider {
        override fun isIgnoringBatteryOptimizations(): Boolean = false

        override fun isPowerSaveMode(): Boolean = powerSaveMode
    }

    @Before
    fun setUp() {
        settings = Settings(testContext)
    }

    private fun feature(provider: PowerManagerInfoProvider) =
        PowerSaveModeFeature(testContext, appStore, settings, provider)

    private fun sendPowerSaveModeChanged() {
        testContext.sendBroadcast(Intent(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED))
        shadowOf(getMainLooper()).idle()
    }

    @Test
    fun `GIVEN power save mode has never been observed WHEN the app starts THEN the current state is persisted`() {
        assertNull(settings.lastKnownPowerSaveMode)

        feature(FakePowerManagerInfoProvider(powerSaveMode = true)).start()

        assertEquals(true, settings.lastKnownPowerSaveMode)
    }

    @Test
    fun `GIVEN the app is running WHEN power save mode turns on THEN an enabled event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = false)
        feature(provider).start()

        provider.powerSaveMode = true
        sendPowerSaveModeChanged()

        val events = PowerSavingMode.changed.testGetValue()!!
        assertEquals(1, events.size)
        assertEquals("true", events.single().extra?.get("enabled"))
    }

    @Test
    fun `GIVEN power save mode is on WHEN it turns off THEN a disabled event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = true)
        feature(provider).start()

        provider.powerSaveMode = false
        sendPowerSaveModeChanged()

        val events = PowerSavingMode.changed.testGetValue()!!
        assertEquals(1, events.size)
        assertEquals("false", events.single().extra?.get("enabled"))
    }

    @Test
    fun `GIVEN power save mode did not change WHEN the broadcast is received THEN no event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = true)
        feature(provider).start()

        sendPowerSaveModeChanged()
        sendPowerSaveModeChanged()

        assertNull(PowerSavingMode.changed.testGetValue())
    }

    @Test
    fun `GIVEN power save mode turned on while backgrounded WHEN the app starts again THEN one event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = false)
        val feature = feature(provider)
        feature.start()
        feature.stop()

        provider.powerSaveMode = true
        feature.start()

        val events = PowerSavingMode.changed.testGetValue()!!
        assertEquals(1, events.size)
        assertEquals("true", events.single().extra?.get("enabled"))
    }

    @Test
    fun `GIVEN power save mode turned on while the process was gone WHEN the app starts THEN one event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = false)
        feature(provider).start()

        provider.powerSaveMode = true
        // A new feature reading a new Settings stands in for a restarted app process.
        PowerSaveModeFeature(testContext, appStore, Settings(testContext), provider).start()

        val events = PowerSavingMode.changed.testGetValue()!!
        assertEquals(1, events.size)
        assertEquals("true", events.single().extra?.get("enabled"))
    }

    @Test
    fun `GIVEN the app is stopped WHEN power save mode changes THEN no event is recorded`() {
        val provider = FakePowerManagerInfoProvider(powerSaveMode = false)
        val feature = feature(provider)
        feature.start()
        feature.stop()

        provider.powerSaveMode = true
        sendPowerSaveModeChanged()

        assertNull(PowerSavingMode.changed.testGetValue())
    }

    @Test
    fun `WHEN the app starts and stops THEN the receiver is registered and unregistered`() {
        val feature = feature(FakePowerManagerInfoProvider())

        assertFalse(feature.isRegistered)

        feature.start()
        assertTrue(feature.isRegistered)

        feature.stop()
        assertFalse(feature.isRegistered)
    }

    @Test
    fun `GIVEN neither preference is enabled WHEN the app starts THEN Power Saving Mode is not active`() {
        feature(FakePowerManagerInfoProvider(powerSaveMode = true)).start()

        assertFalse(appStore.state.isPowerSavingModeActive)
    }

    @Test
    fun `GIVEN Power Saving Mode is enabled manually WHEN the app starts THEN it is active`() {
        settings.powerSavingModeManuallyEnabled = true

        feature(FakePowerManagerInfoProvider(powerSaveMode = false)).start()

        assertTrue(appStore.state.isPowerSavingModeActive)
    }

    @Test
    fun `GIVEN Power Saving Mode follows the OS WHEN power save mode is off THEN it is not active`() {
        settings.powerSavingModeAutoEnabled = true

        feature(FakePowerManagerInfoProvider(powerSaveMode = false)).start()

        assertFalse(appStore.state.isPowerSavingModeActive)
    }

    @Test
    fun `GIVEN Power Saving Mode follows the OS WHEN power save mode turns on THEN it becomes active`() {
        settings.powerSavingModeAutoEnabled = true
        val provider = FakePowerManagerInfoProvider(powerSaveMode = false)
        feature(provider).start()

        provider.powerSaveMode = true
        sendPowerSaveModeChanged()

        assertTrue(appStore.state.isPowerSavingModeActive)
    }

    @Test
    fun `GIVEN the app is started WHEN the manual preference is turned on THEN Power Saving Mode becomes active`() {
        feature(FakePowerManagerInfoProvider(powerSaveMode = false)).start()

        settings.powerSavingModeManuallyEnabled = true

        assertTrue(appStore.state.isPowerSavingModeActive)
    }

    @Test
    fun `GIVEN Power Saving Mode is active WHEN the manual preference is turned off THEN it becomes inactive`() {
        settings.powerSavingModeManuallyEnabled = true
        feature(FakePowerManagerInfoProvider(powerSaveMode = false)).start()

        settings.powerSavingModeManuallyEnabled = false

        assertFalse(appStore.state.isPowerSavingModeActive)
    }
}
