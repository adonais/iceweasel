/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

package org.mozilla.fenix.home.logo

import android.view.ViewGroup
import mozilla.components.support.test.fakes.android.FakeContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.longfox.LongFoxFeatureApi

class LogoControllerTest {

    class FakeLongFoxFeature : LongFoxFeatureApi {
        var started = false
        override fun start(container: ViewGroup) {
            started = true
        }
    }

    class FakeViewGroup : ViewGroup(FakeContext()) {
        override fun onLayout(p0: Boolean, p1: Int, p2: Int, p3: Int, p4: Int) { }
    }

    val fakeLongFoxFeature = FakeLongFoxFeature()

    @Test
    fun `if longfox is disabled, do nothing when entry point clicked`() {
        val logoController = LogoController(
            longFoxFeature = fakeLongFoxFeature,
            container = FakeViewGroup(),
            longFoxEnabled = false,
        )
        logoController.handleLongfoxEntryPointClicked()
        assertFalse(fakeLongFoxFeature.started)
    }

    @Test
    fun `if longfox is enabled but no container exists, do nothing when entry point clicked`() {
        val logoController = LogoController(
            longFoxFeature = fakeLongFoxFeature,
            container = null,
            longFoxEnabled = true,
        )
        logoController.handleLongfoxEntryPointClicked()
        assertFalse(fakeLongFoxFeature.started)
    }

    @Test
    fun `if longfox is enabled and container exists, launch game when entry point clicked`() {
        val logoController = LogoController(
            longFoxFeature = fakeLongFoxFeature,
            container = FakeViewGroup(),
            longFoxEnabled = true,
        )
        logoController.handleLongfoxEntryPointClicked()
        assertTrue(fakeLongFoxFeature.started)
    }
}
