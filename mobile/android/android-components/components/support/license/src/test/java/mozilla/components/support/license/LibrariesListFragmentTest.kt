/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.license

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LibrariesListFragmentTest {

    @Test
    fun `parseLibraries maps each metadata offset to the correct slice of the license blob`() {
        val licensesData = "AAAABBBB".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "0:4 libA",
            "4:4 libB",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(listOf("libA", "libB"), libraries.map { it.name })
        assertEquals("AAAA", libraries[0].license)
        assertEquals("BBBB", libraries[1].license)
    }

    @Test
    fun `parseLibraries keeps library names that contain spaces`() {
        val licensesData = "license!".toByteArray(Charsets.UTF_8)
        val metadata = listOf("0:8 Apache Commons Lang")

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(1, libraries.size)
        assertEquals("Apache Commons Lang", libraries[0].name)
        assertEquals("license!", libraries[0].license)
    }

    @Test
    fun `parseLibraries removes duplicate names case-insensitively keeping the first occurrence`() {
        val licensesData = "XXYY".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "0:2 Foo",
            "2:2 foo",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(1, libraries.size)
        assertEquals("Foo", libraries[0].name)
        assertEquals("XX", libraries[0].license)
    }

    @Test
    fun `parseLibraries sorts libraries by name case-insensitively`() {
        val licensesData = "abc".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "0:1 zebra",
            "1:1 Apple",
            "2:1 mango",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(listOf("Apple", "mango", "zebra"), libraries.map { it.name })
        assertEquals("b", libraries[0].license)
        assertEquals("c", libraries[1].license)
        assertEquals("a", libraries[2].license)
    }

    @Test
    fun `parseLibraries returns an empty list when there is no metadata`() {
        val libraries = parseLibraries(ByteArray(0), emptyList())

        assertTrue(libraries.isEmpty())
    }

    @Test
    fun `parseLibraries decodes multi-byte UTF-8 license text using byte offsets`() {
        val licenseText = "café © 2026"
        val licensesData = licenseText.toByteArray(Charsets.UTF_8)
        val metadata = listOf("0:${licensesData.size} libX")

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(1, libraries.size)
        assertEquals(licenseText, libraries[0].license)
    }

    @Test
    fun `parseLibraries skips malformed lines and keeps the valid ones`() {
        val licensesData = "AB".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "",
            "0:1 valid1",
            "noSpaceHere",
            "0-1 badSection",
            "x:1 nonNumericOffset",
            "0:y nonNumericLength",
            "1:1 valid2",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(listOf("valid1", "valid2"), libraries.map { it.name })
        assertEquals("A", libraries[0].license)
        assertEquals("B", libraries[1].license)
    }

    @Test
    fun `parseLibraries skips lines with a blank library name`() {
        val licensesData = "AB".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "0:1 ",
            "1:1 valid",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(listOf("valid"), libraries.map { it.name })
        assertEquals("B", libraries[0].license)
    }

    @Test
    fun `parseLibraries skips lines whose slice is out of bounds`() {
        val licensesData = "AB".toByteArray(Charsets.UTF_8)
        val metadata = listOf(
            "0:1 valid",
            "1:5 tooLong",
            "5:1 startPastEnd",
            "-1:1 negativeStart",
            "1:2147483647 overflowLength",
        )

        val libraries = parseLibraries(licensesData, metadata)

        assertEquals(listOf("valid"), libraries.map { it.name })
        assertEquals("A", libraries[0].license)
    }
}
