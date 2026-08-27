/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SanitizeUrlForDisplayTest {
    @Test
    fun `GIVEN surrounding whitespace WHEN sanitizing THEN trim it`() {
        val (sanitizedUrl, adjustedDomainIndexRange) = sanitizeUrlForDisplay(
            url = "\n\t  example.com \r\n",
            registrableDomainIndexRange = null,
        )

        assertEquals("example.com", sanitizedUrl)
        assertNull(adjustedDomainIndexRange)
    }

    @Test
    fun `GIVEN internal non-space whitespace WHEN sanitizing THEN remove it`() {
        val (sanitizedUrl, adjustedDomainIndexRange) = sanitizeUrlForDisplay(
            url = "\tquery  with\nline\rbreaks ",
            registrableDomainIndexRange = null,
        )

        assertEquals("query  withlinebreaks", sanitizedUrl)
        assertNull(adjustedDomainIndexRange)
    }

    @Test
    fun `GIVEN a domain range WHEN sanitizing THEN adjust its indexes`() {
        val url = "\n\thttps://www.exa\tmple.com/path\r "
        val domainStart = url.indexOf("exa")
        val domainEnd = url.indexOf("/path")

        val (sanitizedUrl, adjustedDomainIndexRange) = sanitizeUrlForDisplay(
            url = url,
            registrableDomainIndexRange = domainStart to domainEnd,
        )

        val expectedUrl = "https://www.example.com/path"
        val expectedDomainStart = expectedUrl.indexOf("example.com")
        assertEquals(expectedUrl, sanitizedUrl)
        assertEquals(
            expectedDomainStart to expectedDomainStart + "example.com".length,
            adjustedDomainIndexRange,
        )
    }

    @Test
    fun `GIVEN only whitespace WHEN sanitizing THEN return an empty URL and no domain range`() {
        val (sanitizedUrl, adjustedDomainIndexRange) = sanitizeUrlForDisplay(
            url = " \n\t\r",
            registrableDomainIndexRange = 0 to 4,
        )

        assertEquals("", sanitizedUrl)
        assertNull(adjustedDomainIndexRange)
    }
}
