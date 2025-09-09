/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.binding

import androidx.fragment.app.Fragment
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.rule.MainCoroutineRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.ext.removeSecure
import org.mozilla.fenix.ext.secure
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.utils.Settings

class SecureTabManagerBindingTest {

    @get:Rule
    val coroutinesTestRule = MainCoroutineRule()

    private val settings: Settings = mockk(relaxed = true)
    private val fragment: Fragment = mockk(relaxed = true)

    @Before
    fun setup() {
        every { fragment.secure() } just Runs
        every { fragment.removeSecure() } just Runs
    }

    @Test
    fun `WHEN tab selected page switches to private THEN set fragment to secure`() {
        val tabsTrayStore = TabsTrayStore(TabsTrayState())
        val secureTabManagerBinding = SecureTabManagerBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
        )

        secureTabManagerBinding.start()
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.PrivateTabs))
        tabsTrayStore.waitUntilIdle()

        verify { fragment.secure() }
    }

    @Test
    fun `WHEN tab selected page switches to private  and allowScreenshotsInPrivateMode true THEN set fragment to un-secure`() {
        val tabsTrayStore = TabsTrayStore(TabsTrayState())
        val secureTabManagerBinding = SecureTabManagerBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
        )
        every { settings.allowScreenshotsInPrivateMode } returns true

        secureTabManagerBinding.start()
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.PrivateTabs))
        tabsTrayStore.waitUntilIdle()

        verify { fragment.removeSecure() }
    }

    @Test
    fun `GIVEN not in private mode WHEN tab selected page switches to normal tabs from private THEN set fragment to un-secure`() {
        every { settings.lastKnownMode.isPrivate } returns false
        val tabsTrayStore = TabsTrayStore(TabsTrayState())
        val secureTabManagerBinding = SecureTabManagerBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
        )

        secureTabManagerBinding.start()
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))
        tabsTrayStore.waitUntilIdle()

        verify { fragment.removeSecure() }
    }

    @Test
    fun `GIVEN private mode WHEN tab selected page switches to normal tabs from private THEN do nothing`() {
        every { settings.lastKnownMode.isPrivate } returns true
        val tabsTrayStore = TabsTrayStore(TabsTrayState())
        val secureTabManagerBinding = SecureTabManagerBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
        )

        secureTabManagerBinding.start()
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))
        tabsTrayStore.waitUntilIdle()

        verify(exactly = 0) { fragment.removeSecure() }
    }

    @Test
    fun `GIVEN in Normal browsing mode WHEN fragment is stopped THEN set fragment to un-secure`() {
        every { settings.lastKnownMode.isPrivate } returns false
        val tabsTrayStore = TabsTrayStore(TabsTrayState())
        val secureTabManagerBinding = SecureTabManagerBinding(
            store = tabsTrayStore,
            settings = settings,
            fragment = fragment,
        )

        secureTabManagerBinding.start()
        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))
        tabsTrayStore.waitUntilIdle()
        secureTabManagerBinding.stop()

        verify { fragment.removeSecure() }
    }
}
