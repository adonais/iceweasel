/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.automation

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.core.content.ContextCompat
import mozilla.components.support.utils.ext.registerReceiverCompat
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.onboarding.FenixOnboarding

/**
 * Processes launch intents that indicate the app is being started under automation (performance tests, WebDriver /
 * Marionette) and disables user-facing interruptions like onboarding and CFR prompts so tests can proceed without human
 * interaction.
 */
object AutomatedLaunch {

    private const val EXTRA_IS_PERFORMANCE_TEST = "performancetest"
    private const val EXTRA_IS_AUTOMATION = "automationtest"

    /**
     * Processes launch intents that mark the app as running under a performance test or generic test automation
     * (Marionette / WebDriver BiDi). In both cases the onboarding flow and other startup interruptions are disabled so
     * drivers and measurement runs can proceed without human interaction.
     *
     * The two modes are differentiated by their intent extras and gates:
     * - Performance test (`performancetest` extra): requires the device to be USB/AC plugged and ADB enabled.
     * - Automation (`automationtest` extra): requires ADB debugging enabled on the device so a third-party app on a
     *   normal user's phone cannot silently suppress onboarding.
     */
    fun processIntentIfPerformanceTestOrAutomation(intent: Intent, context: Context) {
        if (isPerformanceTest(intent, context) || isAutomation(intent, context)) {
            disableStartupInterruptions(context)
        }
    }

    /**
     * The checks for the charging state and ADB debugging are checks in case another application tries to leverage this
     * intent to trigger a code path for Firefox that shouldn't be used unless it is for testing visual metrics. These
     * checks aren't full proof but most of our users won't have ADB on and charging at the same time when running
     * Firefox.
     */
    private fun isPerformanceTest(intent: Intent, context: Context): Boolean {
        if (!intent.getBooleanExtra(EXTRA_IS_PERFORMANCE_TEST, false)) {
            return false
        }

        if (isEmulator()) {
            return true
        }

        val batteryStatus =
            context.registerReceiverCompat(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )

        batteryStatus?.let {
            // We only run perf tests when the device is connected to USB. However, AC may be reported
            // instead if the device is connected through a USB hub so we check both states.
            val extraPlugged = it.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
            val isPhonePlugged =
                extraPlugged == BatteryManager.BATTERY_PLUGGED_USB || extraPlugged == BatteryManager.BATTERY_PLUGGED_AC

            return isPhonePlugged && isAdbEnabled(context)
        }
        return false
    }

    private fun isAutomation(intent: Intent, context: Context): Boolean {
        if (!intent.getBooleanExtra(EXTRA_IS_AUTOMATION, false)) {
            return false
        }
        return isAdbEnabled(context)
    }

    private fun isAdbEnabled(context: Context): Boolean =
        AndroidSettings.Global.getInt(
            context.contentResolver,
            AndroidSettings.Global.ADB_ENABLED,
            0,
        ) == 1

    /**
     * Returns whether Fenix is running on an Android emulator rather than a physical device. Regular charging checks
     * don't work on a virtual device.
     */
    private fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu") ||
            Build.PRODUCT.contains("sdk") ||
            Build.PRODUCT.contains("emulator") ||
            Build.MODEL.contains("Android SDK built for")

    private fun disableStartupInterruptions(context: Context) {
        disableOnboarding(context)
        disableTrackingProtectionPopups(context)
        disableOpenInApp(context)
        disableS2SCfr(context)
    }

    /** Bypasses the onboarding screen on launch */
    private fun disableOnboarding(context: Context) {
        FenixOnboarding(context).finish()
    }

    /** Disables the tracking protection popup. However, TP is still on. */
    private fun disableTrackingProtectionPopups(context: Context) {
        context.components.settings.isOverrideTPPopupsForPerformanceTest = true
    }

    /** Disables open in app prompt. */
    private fun disableOpenInApp(context: Context) {
        context.components.settings.openLinksInExternalApp =
            context.getString(R.string.pref_key_open_links_in_apps_never)
    }

    private fun disableS2SCfr(context: Context) {
        context.components.settings.shakeToSummarizeToolbarCfrShown = true
    }
}
