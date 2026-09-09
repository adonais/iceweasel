/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDirections
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.components.ShortcutManagerCompatWrapper
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UninstallSurveyManagerTest {

    private lateinit var context: Context
    val intent = Intent(UninstallSurveyManager.ACTION_UNINSTALL_SURVEY)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun `WHEN feature flag is disabled THEN remove dynamic shortcuts`() {
        // Given
        val wrapper = FakeShortcutManagerCompatWrapper()
        val settings =
            Settings(context).apply {
                uninstallSurveyFeatureFlagEnabled = false
            }
        val manager = UninstallSurveyManager(context, wrapper, settings)

        // When
        manager.updateUninstallSurveyShortcut()

        // Then
        assertEquals(1, wrapper.removeDynamicShortcutsInvocations)
        assertEquals(0, wrapper.pushDynamicShortcutInvocations)
    }

    @Test
    fun `WHEN feature flag is enabled THEN push dynamic shortcut`() {
        // Given
        val wrapper = FakeShortcutManagerCompatWrapper()
        val settings =
            Settings(context).apply {
                uninstallSurveyFeatureFlagEnabled = true
            }
        val manager = UninstallSurveyManager(context, wrapper, settings)

        // When
        manager.updateUninstallSurveyShortcut()

        // Then
        assertEquals(1, wrapper.pushDynamicShortcutInvocations)
        assertEquals(0, wrapper.removeDynamicShortcutsInvocations)
    }

    @Test
    fun `WHEN updateUninstallSurveyShortcut throws SecurityException THEN catch it gracefully`() {
        // Given
        val wrapper = FakeShortcutManagerCompatWrapper(pushDynamicShortcutException = SecurityException("Knox block"))
        val settings =
            Settings(context).apply {
                uninstallSurveyFeatureFlagEnabled = true
            }
        val manager = UninstallSurveyManager(context, wrapper, settings)

        // When
        manager.updateUninstallSurveyShortcut()

        // Then
        assertEquals(1, wrapper.pushDynamicShortcutInvocations)
    }

    @Test
    fun `WHEN intent action matches AND not already showing THEN navigate to survey dialog`() {
        // Given
        val currentDestination = NavDestination("").apply { id = R.id.homeFragment }
        val fakeNavController = FakeNavController(context, currentDestination)
        val settings = Settings(context)
        val manager = UninstallSurveyManager(context, FakeShortcutManagerCompatWrapper(), settings)

        // When
        manager.showUninstallSurvey(intent, fakeNavController)

        // Then
        assertEquals(1, fakeNavController.navigateInvocations)
    }

    @Test
    fun `WHEN survey dialog is already showing THEN do not navigate again`() {
        // Given
        val currentDestination = NavDestination("").apply { id = R.id.uninstallSurveyBottomSheetFragment }
        val fakeNavController = FakeNavController(context, currentDestination)
        val settings = Settings(context)
        val manager = UninstallSurveyManager(context, FakeShortcutManagerCompatWrapper(), settings)

        // When
        manager.showUninstallSurvey(intent, fakeNavController)

        // Then
        assertEquals(0, fakeNavController.navigateInvocations)
    }

    @Test
    fun `WHEN intent action does not match THEN ignore navigation`() {
        // Given
        val fakeNavController = FakeNavController(context)
        val settings = Settings(context)
        val manager = UninstallSurveyManager(context, FakeShortcutManagerCompatWrapper(), settings)

        // When
        manager.showUninstallSurvey(Intent("SOME_OTHER_ACTION"), fakeNavController)

        // Then
        assertEquals(0, fakeNavController.navigateInvocations)
    }

    private class FakeShortcutManagerCompatWrapper(private val pushDynamicShortcutException: Exception? = null) :
        ShortcutManagerCompatWrapper {
        var pushDynamicShortcutInvocations = 0
        var removeDynamicShortcutsInvocations = 0
        var lastPushedShortcut: ShortcutInfoCompat? = null
        var lastRemovedShortcutIds: List<String>? = null

        override fun isRequestPinShortcutSupported(context: Context): Boolean = false

        override fun requestPinShortcut(
            context: Context,
            shortcut: ShortcutInfoCompat,
            intentSender: android.content.IntentSender?,
        ): Boolean = false

        override fun pushDynamicShortcut(context: Context, shortcut: ShortcutInfoCompat) {
            pushDynamicShortcutInvocations++
            lastPushedShortcut = shortcut
            pushDynamicShortcutException?.let { throw it }
        }

        override fun removeDynamicShortcuts(context: Context, shortcutIds: List<String>) {
            removeDynamicShortcutsInvocations++
            lastRemovedShortcutIds = shortcutIds
        }
    }

    private class FakeNavController(
        context: Context,
        private val destination: NavDestination? = null,
    ) : NavController(context) {
        var navigateInvocations = 0
        var lastDirections: NavDirections? = null

        override val currentDestination: NavDestination?
            get() = destination

        override fun navigate(directions: NavDirections) {
            navigateInvocations++
            lastDirections = directions
        }
    }
}
