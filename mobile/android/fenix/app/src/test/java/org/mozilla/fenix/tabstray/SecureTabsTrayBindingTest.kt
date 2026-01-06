/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray

import android.view.Window
import android.view.WindowManager
import androidx.fragment.app.Fragment
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.mozilla.fenix.utils.Settings

/**
 * Tests for [SecureTabsTrayBinding].
 */

class SecureTabsTrayBindingTest {

    private val testDispatcher = StandardTestDispatcher()
    private val settings: Settings = mockk(relaxed = true)
    private val fragment: Fragment = mockk(relaxed = true)
    private val dialog: TabsTrayDialog = mockk(relaxed = true)
    private val window: Window = mockk(relaxed = true)
    private lateinit var secureTabsTrayBinding: SecureTabsTrayBinding
    private lateinit var tabsTrayStore: TabsTrayStore

    @Before
    fun setup() {
        tabsTrayStore = TabsTrayStore(TabsTrayState())
        secureTabsTrayBinding = SecureTabsTrayBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
            dialog = dialog,
            mainDispatcher = testDispatcher,
        )

        every { dialog.window } returns window
        every { window.addFlags(any()) } just Runs
        every { window.clearFlags(any()) } just Runs
        every { secureTabsTrayBinding.setSecureMode(true) } just Runs
        every { secureTabsTrayBinding.setSecureMode(false) } just Runs
    }

    @Test
    fun `WHEN tab selected page switches to private THEN set fragment to secure`() = runTest(testDispatcher) {
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.PrivateTabs))

        secureTabsTrayBinding.start()
        testDispatcher.scheduler.advanceUntilIdle()

        verify { window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }

    @Test
    fun `WHEN tab selected page switches to private and allowScreenshotsInPrivateMode true THEN set fragment to un-secure`() = runTest(testDispatcher) {
        every { settings.allowScreenshotsInPrivateMode } returns true

        secureTabsTrayBinding.start()
        testDispatcher.scheduler.advanceUntilIdle()

        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.PrivateTabs))

        verify { window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }

    @Test
    fun `WHEN tab selected page switches to private and allowScreenshotsInPrivateMode false and shouldSecureModeBeOverridden true THEN set fragment to un-secure`() = runTest(testDispatcher) {
        every { settings.allowScreenshotsInPrivateMode } returns false
        every { settings.allowScreenCaptureInSecureScreens } returns false

        secureTabsTrayBinding.start()
        testDispatcher.scheduler.advanceUntilIdle()

        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.PrivateTabs))

        verify { window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }

    @Test
    fun `GIVEN not in private mode WHEN tab selected page switches to normal tabs from private THEN set fragment to un-secure`() = runTest(testDispatcher) {
        every { settings.lastKnownMode.isPrivate } returns false

        secureTabsTrayBinding.start()
        testDispatcher.scheduler.advanceUntilIdle()

        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))

        verify { window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }

    @Test
    fun `GIVEN private mode WHEN tab selected page switches to normal tabs from private THEN do nothing`() = runTest(testDispatcher) {
        every { settings.lastKnownMode.isPrivate } returns true

        secureTabsTrayBinding.start()
        testDispatcher.scheduler.advanceUntilIdle()

        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))

        verify(exactly = 0) { window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}
