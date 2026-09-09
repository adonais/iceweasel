/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertEquals
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FirefoxLabsSettingsSearchProviderTest {

    @Test
    fun `WHEN getting search items THEN a Firefox Labs item is returned`() {
        val provider = FirefoxLabsSettingsSearchProvider()

        val items = provider.getSearchItems(testContext)

        assertEquals(
            expected = 1,
            actual = items.size,
            message = "Expected exactly one search item for Firefox Labs",
        )
        assertEquals(
            expected = FirefoxLabsSettingsSearchProvider.FIREFOX_LABS_KEY,
            actual = items.first().preferenceKey,
            message = "Expected the item key to match the Firefox Labs preference key",
        )
    }
}
