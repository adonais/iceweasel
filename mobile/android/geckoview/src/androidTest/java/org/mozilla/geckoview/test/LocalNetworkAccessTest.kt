/* -*- Mode: Java; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil; -*-
 * Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

private const val LNA_BLOCKING_PREF = "network.lna.blocking"

@RunWith(AndroidJUnit4::class)
class LocalNetworkAccessTest : BaseSessionTest() {

    @Test
    fun setLnaBlockingEnabled_updatesPrefsToTrue() {
        val settings = sessionRule.runtime.settings

        settings.setLnaBlockingEnabled(true)

        val lnaBlockingPrefValue = sessionRule.getPrefs(LNA_BLOCKING_PREF)[0] as Boolean

        assertTrue(
            "Calling setLnaBLockingEnabled(true) should set the pref to true",
            lnaBlockingPrefValue,
        )
    }

    @Test
    fun setLnaBlockingEnabled_updatesPrefsToFalse() {
        val settings = sessionRule.runtime.settings

        settings.setLnaBlockingEnabled(false)

        val lnaBlockingPrefValue = sessionRule.getPrefs(LNA_BLOCKING_PREF)[0] as Boolean

        assertFalse(
            "Calling setLnaBLockingEnabled(false) should set the pref to false",
            lnaBlockingPrefValue,
        )
    }

    @Test
    fun getLnaBlockingEnabled_returnsTrueWhenLnaBlockingIsSetToTrue() {
        val settings = sessionRule.runtime.settings
        settings.setLnaBlockingEnabled(true)

        assertTrue(
            "getLnaBlockingEnabled() should return true",
            settings.lnaBlockingEnabled,
        )
    }

    @Test
    fun getLnaBlockingEnabled_returnsFalseWhenLnaBlockingIsSetToFalse() {
        val settings = sessionRule.runtime.settings
        settings.setLnaBlockingEnabled(false)

        assertFalse(
            "getLnaBlockingEnabled() should return false",
            settings.lnaBlockingEnabled,
        )
    }
}
