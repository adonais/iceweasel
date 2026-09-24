/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import mozilla.components.concept.engine.DefaultSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mozilla.fenix.nimbus.BaselineFpp
import org.mozilla.fenix.nimbus.FingerprintingProtection

class CoreFingerprintingProtectionTest {

    @Test
    fun `GIVEN a recipe supplies no values WHEN applied THEN the existing settings are left alone`() {
        val settings =
            DefaultSettings(
                fingerprintingProtection = true,
                fingerprintingProtectionPrivateBrowsing = true,
                fingerprintingProtectionOverrides = "+Target1",
            )

        applyFingerprintingProtectionFeature(settings, FingerprintingProtection())

        assertEquals(true, settings.fingerprintingProtection)
        assertEquals(true, settings.fingerprintingProtectionPrivateBrowsing)
        assertEquals("+Target1", settings.fingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a recipe supplies only fdlibmMath WHEN applied THEN the other settings are left alone`() {
        val settings =
            DefaultSettings(
                fingerprintingProtection = true,
                fingerprintingProtectionPrivateBrowsing = true,
                fingerprintingProtectionOverrides = "+Target1",
            )

        applyFingerprintingProtectionFeature(
            settings,
            FingerprintingProtection(enabled = true, fdlibmMath = true),
        )

        assertEquals(true, settings.fingerprintingProtection)
        assertEquals(true, settings.fingerprintingProtectionPrivateBrowsing)
        assertEquals("+Target1", settings.fingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a recipe supplies every value WHEN applied THEN all of them are written`() {
        val settings =
            DefaultSettings(
                fingerprintingProtection = true,
                fingerprintingProtectionPrivateBrowsing = true,
                fingerprintingProtectionOverrides = "+Target1",
            )

        applyFingerprintingProtectionFeature(
            settings,
            FingerprintingProtection(
                enabledNormal = false,
                enabledPrivate = false,
                overrides = "-Target2",
            ),
        )

        assertEquals(false, settings.fingerprintingProtection)
        assertEquals(false, settings.fingerprintingProtectionPrivateBrowsing)
        assertEquals("-Target2", settings.fingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a recipe supplies one value WHEN applied THEN only that value is written`() {
        val settings =
            DefaultSettings(
                fingerprintingProtection = true,
                fingerprintingProtectionPrivateBrowsing = true,
                fingerprintingProtectionOverrides = "+Target1",
            )

        applyFingerprintingProtectionFeature(
            settings,
            FingerprintingProtection(enabledNormal = false),
        )

        assertEquals(false, settings.fingerprintingProtection)
        assertEquals(true, settings.fingerprintingProtectionPrivateBrowsing)
        assertEquals("+Target1", settings.fingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a recipe supplies false WHEN applied THEN false is written rather than treated as unset`() {
        val settings = DefaultSettings(fingerprintingProtection = true)

        applyFingerprintingProtectionFeature(
            settings,
            FingerprintingProtection(enabledNormal = false),
        )

        assertEquals(false, settings.fingerprintingProtection)
    }

    @Test
    fun `GIVEN a recipe supplies an empty overrides string WHEN applied THEN it is written`() {
        val settings = DefaultSettings(fingerprintingProtectionOverrides = "+Target1")

        applyFingerprintingProtectionFeature(
            settings,
            FingerprintingProtection(overrides = ""),
        )

        assertEquals("", settings.fingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN unset settings and an empty recipe WHEN applied THEN the settings stay unset`() {
        val settings = DefaultSettings()

        applyFingerprintingProtectionFeature(settings, FingerprintingProtection())

        assertNull(settings.fingerprintingProtection)
        assertNull(settings.fingerprintingProtectionPrivateBrowsing)
    }

    @Test
    fun `GIVEN a baseline recipe supplies no values WHEN applied THEN the existing settings are left alone`() {
        val settings =
            DefaultSettings(
                baselineFingerprintingProtection = true,
                baselineFingerprintingProtectionOverrides = "+Target1",
            )

        applyBaselineFingerprintingProtectionFeature(settings, BaselineFpp())

        assertEquals(true, settings.baselineFingerprintingProtection)
        assertEquals("+Target1", settings.baselineFingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a baseline recipe supplies only featEnabled WHEN applied THEN the other settings are left alone`() {
        val settings =
            DefaultSettings(
                baselineFingerprintingProtection = true,
                baselineFingerprintingProtectionOverrides = "+Target1",
            )

        applyBaselineFingerprintingProtectionFeature(settings, BaselineFpp(featEnabled = true))

        assertEquals(true, settings.baselineFingerprintingProtection)
        assertEquals("+Target1", settings.baselineFingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a baseline recipe supplies every value WHEN applied THEN all of them are written`() {
        val settings =
            DefaultSettings(
                baselineFingerprintingProtection = true,
                baselineFingerprintingProtectionOverrides = "+Target1",
            )

        applyBaselineFingerprintingProtectionFeature(
            settings,
            BaselineFpp(enabled = false, overrides = "-Target2"),
        )

        assertEquals(false, settings.baselineFingerprintingProtection)
        assertEquals("-Target2", settings.baselineFingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a baseline recipe supplies only overrides WHEN applied THEN enabled is left alone`() {
        val settings =
            DefaultSettings(
                baselineFingerprintingProtection = true,
                baselineFingerprintingProtectionOverrides = "+Target1",
            )

        applyBaselineFingerprintingProtectionFeature(settings, BaselineFpp(overrides = "-Target2"))

        assertEquals(true, settings.baselineFingerprintingProtection)
        assertEquals("-Target2", settings.baselineFingerprintingProtectionOverrides)
    }

    @Test
    fun `GIVEN a baseline recipe supplies false WHEN applied THEN false is written rather than treated as unset`() {
        val settings = DefaultSettings(baselineFingerprintingProtection = true)

        applyBaselineFingerprintingProtectionFeature(settings, BaselineFpp(enabled = false))

        assertEquals(false, settings.baselineFingerprintingProtection)
    }

    @Test
    fun `GIVEN unset baseline settings and an empty recipe WHEN applied THEN the settings stay unset`() {
        val settings = DefaultSettings()

        applyBaselineFingerprintingProtectionFeature(settings, BaselineFpp())

        assertNull(settings.baselineFingerprintingProtection)
        assertNull(settings.baselineFingerprintingProtectionOverrides)
    }
}
