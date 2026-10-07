/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.reloadcover

import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.utils.Settings

class TabReloadCoverGatingTest {

    private fun settingsWith(cover: Boolean, scrollAware: Boolean): Settings = mockk {
        every { tabReloadCoverEnabled } returns cover
        every { tabReloadCoverScrollAwareEnabled } returns scrollAware
    }

    @Test
    fun `GIVEN cover disabled WHEN checking gating THEN both cover and scroll-aware are disabled`() {
        val settings = settingsWith(cover = false, scrollAware = false)

        assertFalse(TabReloadCoverGating.isCoverEnabled(settings))
        assertFalse(TabReloadCoverGating.isScrollAwareEnabled(settings))
    }

    @Test
    fun `GIVEN cover enabled and scroll-aware disabled WHEN checking gating THEN only cover is enabled`() {
        val settings = settingsWith(cover = true, scrollAware = false)

        assertTrue(TabReloadCoverGating.isCoverEnabled(settings))
        assertFalse(TabReloadCoverGating.isScrollAwareEnabled(settings))
    }

    @Test
    fun `GIVEN cover and scroll-aware both enabled WHEN checking gating THEN both are enabled`() {
        val settings = settingsWith(cover = true, scrollAware = true)

        assertTrue(TabReloadCoverGating.isCoverEnabled(settings))
        assertTrue(TabReloadCoverGating.isScrollAwareEnabled(settings))
    }

    @Test
    fun `GIVEN cover disabled and scroll-aware enabled WHEN checking gating THEN scroll-aware is still disabled`() {
        // Guards against a stray override where scroll-aware=true is set alone; scroll-aware capture is only
        // meaningful when the cover itself is active. Also mirrors the UI's `android:dependency` behavior.
        val settings = settingsWith(cover = false, scrollAware = true)

        assertFalse(TabReloadCoverGating.isCoverEnabled(settings))
        assertFalse(TabReloadCoverGating.isScrollAwareEnabled(settings))
    }
}
