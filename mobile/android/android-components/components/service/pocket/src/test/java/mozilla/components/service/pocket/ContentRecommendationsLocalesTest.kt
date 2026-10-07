/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket

import java.util.Locale
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentRecommendationsLocalesTest {

    @Test
    fun `GIVEN locales with supported language and region WHEN content recommendation locale support is checked THEN return true`() {
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

        locales.forEach { assertTrue(it, isContentRecommendationsLocaleSupported(Locale.forLanguageTag(it))) }
    }

    @Test
    fun `GIVEN a locale without a region WHEN content recommendation locale support is checked THEN return false`() {
        listOf("fr", "es", "it", "en", "de", "pl").forEach {
            assertFalse(it, isContentRecommendationsLocaleSupported(Locale.forLanguageTag(it)))
        }
    }

    @Test
    fun `GIVEN a locale with an unsupported region WHEN content recommendation locale support is checked THEN return false`() {
        assertFalse(isContentRecommendationsLocaleSupported(Locale.forLanguageTag("es-AR")))
        assertFalse(isContentRecommendationsLocaleSupported(Locale.forLanguageTag("en-AU")))
        assertFalse(isContentRecommendationsLocaleSupported(Locale.forLanguageTag("de-LI")))
    }

    @Test
    fun `GIVEN a locale with an unsupported language WHEN content recommendation locale support is checked THEN return false`() {
        assertFalse(isContentRecommendationsLocaleSupported(Locale.JAPAN))
        assertFalse(isContentRecommendationsLocaleSupported(Locale.forLanguageTag("zh-Hans-CN")))
        assertFalse(isContentRecommendationsLocaleSupported(Locale.forLanguageTag("")))
    }
}
