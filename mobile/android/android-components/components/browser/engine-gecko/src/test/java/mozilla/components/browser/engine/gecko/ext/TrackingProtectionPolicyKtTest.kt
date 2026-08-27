/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.engine.gecko.ext

import androidx.annotation.OptIn
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.EngineSession.TrackingProtectionPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.geckoview.ContentBlocking.EtpLevel
import org.mozilla.geckoview.ExperimentalGeckoViewApi

class TrackingProtectionPolicyKtTest {

    private val defaultSafeBrowsing = arrayOf(EngineSession.SafeBrowsingPolicy.RECOMMENDED)

    @OptIn(ExperimentalGeckoViewApi::class)
    @Test
    fun `transform the policy to a GeckoView ContentBlockingSetting`() {
        val policy = TrackingProtectionPolicy.recommended()
        val setting = policy.toContentBlockingSetting()

        assertEquals(policy.getEtpLevel(), setting.enhancedTrackingProtectionLevel)
        assertEquals(policy.getAntiTrackingPolicy(), setting.antiTrackingCategories)
        assertEquals(policy.cookiePolicy.id, setting.cookieBehavior)
        assertEquals(policy.cookiePolicyPrivateMode.id, setting.cookieBehavior)
        assertEquals(defaultSafeBrowsing.sumOf { it.id }, setting.safeBrowsingCategories)
        assertEquals(setting.strictSocialTrackingProtection, policy.strictSocialTrackingProtection)
        assertEquals(setting.cookiePurging, policy.cookiePurging)
        assertFalse(setting.queryParameterStrippingEnabled)
        assertFalse(setting.queryParameterStrippingPrivateBrowsingEnabled)
        assertEquals("", setting.queryParameterStrippingAllowList[0])
        assertEquals("", setting.queryParameterStrippingStripList[0])

        val policyWithSafeBrowsing =
            TrackingProtectionPolicy.recommended().toContentBlockingSetting(
                safeBrowsingPolicy = emptyArray(),
                queryParameterStripping = true,
                queryParameterStrippingPrivateBrowsing = true,
                queryParameterStrippingAllowList = "AllowList",
                queryParameterStrippingStripList = "StripList",
            )
        assertEquals(0, policyWithSafeBrowsing.safeBrowsingCategories)
        assertTrue(policyWithSafeBrowsing.queryParameterStrippingEnabled)
        assertTrue(policyWithSafeBrowsing.queryParameterStrippingPrivateBrowsingEnabled)
        assertEquals("AllowList", policyWithSafeBrowsing.queryParameterStrippingAllowList[0])
        assertEquals("StripList", policyWithSafeBrowsing.queryParameterStrippingStripList[0])

        // Verify safe browsing simulation defaults
        val defaultSetting = TrackingProtectionPolicy.recommended().toContentBlockingSetting()
        assertFalse(defaultSetting.safeBrowsingGlobalCacheEnabled)
        assertFalse(defaultSetting.safeBrowsingRealTimeEnabled)
        assertFalse(defaultSetting.safeBrowsingRealTimeSimulationEnabled)
        assertEquals(5, defaultSetting.safeBrowsingRealTimeSimulationHitProbability)
        assertEquals(300, defaultSetting.safeBrowsingRealTimeSimulationCacheTTLSec)
        assertFalse(defaultSetting.safeBrowsingRealTimeSimulationNegativeCacheEnabled)
        assertEquals(300, defaultSetting.safeBrowsingRealTimeSimulationNegativeCacheTTLSec)

        // Verify safe browsing simulation custom values
        val customSetting = TrackingProtectionPolicy.recommended().toContentBlockingSetting(
            safeBrowsingGlobalCacheEnabled = true,
            safeBrowsingRealTimeEnabled = true,
            safeBrowsingRealTimeSimulationEnabled = true,
            safeBrowsingRealTimeSimulationHitProbability = 50,
            safeBrowsingRealTimeSimulationCacheTTLSec = 600,
            safeBrowsingRealTimeSimulationNegativeCacheEnabled = true,
            safeBrowsingRealTimeSimulationNegativeCacheTTLSec = 120,
        )
        assertTrue(customSetting.safeBrowsingGlobalCacheEnabled)
        assertTrue(customSetting.safeBrowsingRealTimeEnabled)
        assertTrue(customSetting.safeBrowsingRealTimeSimulationEnabled)
        assertEquals(50, customSetting.safeBrowsingRealTimeSimulationHitProbability)
        assertEquals(600, customSetting.safeBrowsingRealTimeSimulationCacheTTLSec)
        assertTrue(customSetting.safeBrowsingRealTimeSimulationNegativeCacheEnabled)
        assertEquals(120, customSetting.safeBrowsingRealTimeSimulationNegativeCacheTTLSec)
    }

    @Test
    fun `getEtpLevel reflects TrackingProtectionPolicy`() {
        assertEquals(EtpLevel.DEFAULT, TrackingProtectionPolicy.recommended().getEtpLevel())
        assertEquals(EtpLevel.STRICT, TrackingProtectionPolicy.strict().getEtpLevel())
        assertEquals(EtpLevel.NONE, TrackingProtectionPolicy.none().getEtpLevel())
    }

    @Test
    fun `getStrictSocialTrackingProtection is true if category is STRICT`() {
        val recommendedPolicy = TrackingProtectionPolicy.recommended()
        val strictPolicy = TrackingProtectionPolicy.strict()

        assertFalse(recommendedPolicy.toContentBlockingSetting().strictSocialTrackingProtection)
        assertTrue(strictPolicy.toContentBlockingSetting().strictSocialTrackingProtection)
    }
}
