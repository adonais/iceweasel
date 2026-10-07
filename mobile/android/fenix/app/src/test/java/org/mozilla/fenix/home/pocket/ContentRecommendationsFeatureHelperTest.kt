/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.Locale
import mozilla.components.support.locale.LocaleManager
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ContentRecommendationsFeatureHelperTest {

    @Before
    @After
    fun cleanUp() {
        LocaleManager.resetToSystemDefault(context = testContext, localeUseCase = null)
    }

    @Test
    fun `GIVEN unsupported locale WHEN pocket sponsored stories feature enabled check is invoked THEN return false`() {
        val locale = Locale.Builder().setLanguage("ro").setRegion("RO").build()
        LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = locale)

        assertFalse(ContentRecommendationsFeatureHelper.isPocketSponsoredStoriesFeatureEnabled(testContext))
    }

    @Test
    fun `GIVEN supported en-US locale WHEN pocket sponsored stories feature enabled check is invoked THEN return true`() {
        val locale = Locale.Builder().setLanguage("en").setRegion("US").build()
        LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = locale)

        assertTrue(ContentRecommendationsFeatureHelper.isPocketSponsoredStoriesFeatureEnabled(testContext))
    }

    @Test
    fun `GIVEN supported en-CA locale WHEN pocket sponsored stories feature enabled check is invoked THEN return true`() {
        val locale = Locale.Builder().setLanguage("en").setRegion("CA").build()
        LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = locale)

        assertTrue(ContentRecommendationsFeatureHelper.isPocketSponsoredStoriesFeatureEnabled(testContext))
    }

    @Test
    fun `GIVEN unsupported locales WHEN content recommendations feature enabled check is invoked THEN return false`() {
        listOf("ro-RO", "es-AR").forEach {
            LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = Locale.forLanguageTag(it))

            assertFalse(it, ContentRecommendationsFeatureHelper.isContentRecommendationsFeatureEnabled(testContext))
        }
    }

    @Test
    fun `GIVEN locales with a supported language and region WHEN content recommendations feature enabled check is invoked THEN return true`() {
        val locales =
            listOf(
                "fr-FR",
                "es-ES",
                "it-IT",
                "en-CA",
                "en-GB",
                "en-IE",
                "en-US",
                "de-DE",
                "de-AT",
                "de-CH",
                "pl-PL",
            )

        locales.forEach {
            LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = Locale.forLanguageTag(it))

            assertTrue(it, ContentRecommendationsFeatureHelper.isContentRecommendationsFeatureEnabled(testContext))
        }
    }

    @Test
    fun `GIVEN locales without a region WHEN content recommendations feature enabled check is invoked THEN return false`() {
        listOf("fr", "es", "it", "en", "de", "pl").forEach {
            LocaleManager.setNewLocale(testContext, localeUseCase = null, locale = Locale.forLanguageTag(it))

            assertFalse(it, ContentRecommendationsFeatureHelper.isContentRecommendationsFeatureEnabled(testContext))
        }
    }
}
