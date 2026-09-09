/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.remotesettings

import java.util.Locale
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppContextTest {
    @Test
    fun `GIVEN a context THEN generateAppContext() produces correct locale strings`() {
        val codesToCheck =
            listOf(
                "en-US",
                "pt-BR",
                "en-US-boont", // https://en.wikipedia.org/wiki/Boontling
            )
        for (code in codesToCheck) {
            val locale = Locale.forLanguageTag(code)
            assertEquals(code, generateAppContext(testContext, "release", true, locale).locale)
        }
    }
}
