/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.downloads

import mozilla.components.concept.fetch.MutableHeaders
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ContentRangeTest {

    @Test
    fun `GIVEN a valid Content-Range header WHEN parsing THEN the start and total length are returned`() {
        val parsed = parseContentRange(MutableHeaders("Content-Range" to "bytes 100-999/1000"))

        assertEquals(ParsedContentRange(start = 100, totalLength = 1000), parsed)
    }

    @Test
    fun `GIVEN a valid Content-Range header with an unknown total length WHEN parsing THEN the total length is null`() {
        val parsed = parseContentRange(MutableHeaders("Content-Range" to "bytes 100-999/*"))

        assertEquals(ParsedContentRange(start = 100, totalLength = null), parsed)
    }

    @Test
    fun `GIVEN no Content-Range header WHEN parsing THEN null is returned`() {
        val parsed = parseContentRange(MutableHeaders())

        assertNull(parsed)
    }

    @Test
    fun `GIVEN a malformed Content-Range header WHEN parsing THEN null is returned`() {
        val parsed = parseContentRange(MutableHeaders("Content-Range" to "100-999/1000"))

        assertNull(parsed)
    }

    @Test
    fun `GIVEN a Content-Range header with an overflowing start WHEN parsing THEN null is returned`() {
        val parsed = parseContentRange(MutableHeaders("Content-Range" to "bytes 9223372036854775808-999/1000"))

        assertNull(parsed)
    }

    @Test
    fun `GIVEN a Content-Range header with an overflowing total length WHEN parsing THEN the total length is null`() {
        val parsed = parseContentRange(MutableHeaders("Content-Range" to "bytes 100-999/9223372036854775808"))

        assertEquals(ParsedContentRange(start = 100, totalLength = null), parsed)
    }
}
