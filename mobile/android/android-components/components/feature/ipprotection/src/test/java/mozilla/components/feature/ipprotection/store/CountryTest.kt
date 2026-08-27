/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.feature.ipprotection.store.state.Country
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@OptIn(ExperimentalAndroidComponentsApi::class)
class CountryTest {

    @Test
    fun `GIVEN a valid country code WHEN reading displayName THEN the localized country name is returned`() {
        assertEquals("Japan", Country(countryCode = "JP", available = true).displayName)
    }

    @Test
    fun `GIVEN a lowercase country code WHEN reading displayName THEN the localized country name is returned`() {
        assertEquals("Japan", Country(countryCode = "jp", available = true).displayName)
    }

    // If the output is broken, we show (and let the backend know)
    @Test
    fun `GIVEN an empty string WHEN reading displayName THEN an empty string is returned`() {
        assertEquals("", Country(countryCode = "", available = true).displayName)
    }

    @Test
    fun `GIVEN an ill-formed country code WHEN reading displayName THEN the raw code is returned`() {
        assertEquals("jap", Country(countryCode = "jap", available = true).displayName)
        assertEquals("1", Country(countryCode = "1", available = true).displayName)
    }
}
