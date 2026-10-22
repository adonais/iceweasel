/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.lifecycle

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.os.PowerManager
import androidx.annotation.VisibleForTesting
import androidx.core.content.ContextCompat
import mozilla.components.support.base.android.DefaultPowerManagerInfoProvider
import mozilla.components.support.base.android.PowerManagerInfoProvider
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.utils.ext.registerReceiverCompat
import org.mozilla.fenix.GleanMetrics.PowerSavingMode
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.ext.getPreferenceKey
import org.mozilla.fenix.utils.Settings

/**
 * [LifecycleAwareFeature] that keeps [AppState.isPowerSavingModeActive] in sync while the app is in the foreground, and
 * records a [PowerSavingMode.changed] event whenever the OS power saving (battery saver) mode is turned on or off.
 *
 * Listening is scoped to the foreground, so a change made while the app is backgrounded is instead detected by
 * comparing against [Settings.lastKnownPowerSaveMode] when the app next starts. That value is persisted, so a change
 * made while the app process was not running is detected the same way.
 *
 * @param context [Context] used to register the power save mode broadcast receiver.
 * @param appStore [AppStore] holding the Power Saving Mode state the rest of the app observes.
 * @param settings Holds the two Power Saving Mode preferences and the last observed power save mode state.
 * @param powerManagerInfoProvider Provides the current power save mode state.
 */
class PowerSaveModeFeature(
    private val context: Context,
    private val appStore: AppStore,
    private val settings: Settings,
    private val powerManagerInfoProvider: PowerManagerInfoProvider = DefaultPowerManagerInfoProvider(context),
) : LifecycleAwareFeature {

    @VisibleForTesting internal var isRegistered = false

    private val powerSaveModeChangedReceiver by lazy {
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                maybeRecordPowerSaveModeChange()
                updatePowerSavingModeState()
            }
        }
    }

    /**
     * Whether Power Saving Mode is currently active, either because it was turned on manually or because it follows the
     * OS power save (battery saver) mode, which is on.
     */
    private val isPowerSavingModeActive: Boolean
        get() =
            settings.powerSavingModeManuallyEnabled ||
                (settings.powerSavingModeAutoEnabled && powerManagerInfoProvider.isPowerSaveMode())

    private val powerSavingModePreferenceKeys by lazy {
        setOf(
            context.getPreferenceKey(R.string.pref_key_power_saving_mode_auto_enabled),
            context.getPreferenceKey(R.string.pref_key_power_saving_mode_manually_enabled),
        )
    }

    private val preferenceChangeListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key in powerSavingModePreferenceKeys) {
            updatePowerSavingModeState()
        }
    }

    override fun start() {
        if (!isRegistered) {
            context.registerReceiverCompat(
                powerSaveModeChangedReceiver,
                IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            // Shared preferences only hold a weak reference to their listeners, so this is registered on every
            // foreground rather than once.
            settings.preferences.registerOnSharedPreferenceChangeListener(preferenceChangeListener)
            isRegistered = true
        }

        // Catches a change that happened while nothing was registered.
        maybeRecordPowerSaveModeChange()
        updatePowerSavingModeState()
    }

    override fun stop() {
        if (isRegistered) {
            context.unregisterReceiver(powerSaveModeChangedReceiver)
            settings.preferences.unregisterOnSharedPreferenceChangeListener(preferenceChangeListener)
            isRegistered = false
        }
    }

    private fun maybeRecordPowerSaveModeChange() {
        val isPowerSaveMode = powerManagerInfoProvider.isPowerSaveMode()
        val previous = settings.lastKnownPowerSaveMode
        settings.lastKnownPowerSaveMode = isPowerSaveMode

        // The state of the first observation is already reported by
        // PowerSavingMode.activeAtStartup, so only transitions are recorded here.
        if (previous == null || previous == isPowerSaveMode) return

        PowerSavingMode.changed.record(PowerSavingMode.ChangedExtra(enabled = isPowerSaveMode))
    }

    private fun updatePowerSavingModeState() {
        val isActive = isPowerSavingModeActive
        if (appStore.state.isPowerSavingModeActive != isActive) {
            appStore.dispatch(AppAction.PowerSavingModeAction.Changed(isActive))
        }
    }
}
