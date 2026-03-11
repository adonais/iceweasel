/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bindings

import android.view.Window
import android.view.WindowManager.LayoutParams.FLAG_SECURE
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.DefaultBrowsingModeManager
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.theme.ThemeManager
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class BrowsingModeBindingTest {

    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `GIVEN private mode WHEN mode changes to private THEN FLAG_SECURE is added`() = runTest(testDispatcher) {
        val window = mockk<Window>(relaxed = true)
        val settings = mockk<Settings> {
            every { shouldSecureModeBeOverridden } returns false
        }
        val appStore = AppStore()
        val browsingModeManager = mockk<DefaultBrowsingModeManager>(relaxed = true)

        val binding = BrowsingModeBinding(
            window = window,
            settings = settings,
            store = appStore,
            themeManagerProvider = { null },
            browsingModeManager = browsingModeManager,
            mainDispatcher = testDispatcher,
        )
        binding.start()

        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()

        verify { window.addFlags(FLAG_SECURE) }
    }

    @Test
    fun `GIVEN normal mode WHEN mode changes to normal THEN FLAG_SECURE is cleared`() = runTest(testDispatcher) {
        val window = mockk<Window>(relaxed = true)
        val settings = mockk<Settings> {
            every { shouldSecureModeBeOverridden } returns false
        }
        val appStore = AppStore()
        val browsingModeManager = mockk<DefaultBrowsingModeManager>(relaxed = true)

        val binding = BrowsingModeBinding(
            window = window,
            settings = settings,
            store = appStore,
            themeManagerProvider = { null },
            browsingModeManager = browsingModeManager,
            mainDispatcher = testDispatcher,
        )
        binding.start()

        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Normal))
        testDispatcher.scheduler.advanceUntilIdle()

        verify { window.clearFlags(FLAG_SECURE) }
    }

    @Test
    fun `GIVEN secure mode override WHEN mode changes to private THEN FLAG_SECURE is cleared`() = runTest(testDispatcher) {
        val window = mockk<Window>(relaxed = true)
        val settings = mockk<Settings> {
            every { shouldSecureModeBeOverridden } returns true
        }
        val appStore = AppStore()
        val browsingModeManager = mockk<DefaultBrowsingModeManager>(relaxed = true)

        val binding = BrowsingModeBinding(
            window = window,
            settings = settings,
            store = appStore,
            themeManagerProvider = { null },
            browsingModeManager = browsingModeManager,
            mainDispatcher = testDispatcher,
        )
        binding.start()

        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()

        verify { window.clearFlags(FLAG_SECURE) }
    }

    @Test
    fun `WHEN mode changes THEN theme manager is updated`() = runTest(testDispatcher) {
        val window = mockk<Window>(relaxed = true)
        val settings = mockk<Settings> {
            every { shouldSecureModeBeOverridden } returns false
        }
        val appStore = AppStore()
        val themeManager = mockk<ThemeManager>(relaxed = true)
        val browsingModeManager = mockk<DefaultBrowsingModeManager>(relaxed = true)

        val binding = BrowsingModeBinding(
            window = window,
            settings = settings,
            store = appStore,
            themeManagerProvider = { themeManager },
            browsingModeManager = browsingModeManager,
            mainDispatcher = testDispatcher,
        )
        binding.start()

        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()

        verify { themeManager.currentTheme = BrowsingMode.Private }
    }

    @Test
    fun `WHEN mode changes THEN browsing mode manager is synced`() = runTest(testDispatcher) {
        val window = mockk<Window>(relaxed = true)
        val settings = mockk<Settings> {
            every { shouldSecureModeBeOverridden } returns false
        }
        val appStore = AppStore()
        val browsingModeManager = mockk<DefaultBrowsingModeManager>(relaxed = true)

        val binding = BrowsingModeBinding(
            window = window,
            settings = settings,
            store = appStore,
            themeManagerProvider = { null },
            browsingModeManager = browsingModeManager,
            mainDispatcher = testDispatcher,
        )
        binding.start()

        appStore.dispatch(AppAction.BrowsingModeManagerModeChanged(BrowsingMode.Private))
        testDispatcher.scheduler.advanceUntilIdle()

        verify { browsingModeManager.syncMode(BrowsingMode.Private) }
    }
}
