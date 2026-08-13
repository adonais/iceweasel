/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.conventions

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class BuildConfigTest {
    @TempDir
    lateinit var tempDir: File

    @Test
    fun `uses a valid MOZ_BUILD_DATE verbatim`() {
        val version = getManifestVersionString("119.0", tempDir.absolutePath, "20250115143000")
        assertEquals("119.0.20250115.143000", version)
    }

    @Test
    fun `formats the build date with the calendar year, not the week-based year`() {
        // 2027-01-01 falls in an ISO week whose week-based year is 2026, so a `YYYY`
        // (week-based-year) pattern would yield 2026 here. The calendar-year `yyyy`
        // pattern must keep it 2027.
        val version = getManifestVersionString("119.0", tempDir.absolutePath, "20270101120000")
        assertEquals("119.0.20270101.120000", version)
    }

    @Test
    fun `falls back to buildid_h when MOZ_BUILD_DATE is absent or invalid`() {
        File(tempDir, "buildid.h").writeText("#define MOZ_BUILDID 20240630140000\n")

        assertEquals(
            "119.0.20240630.140000",
            getManifestVersionString("119.0", tempDir.absolutePath, null),
        )
        assertEquals(
            "119.0.20240630.140000",
            getManifestVersionString("119.0", tempDir.absolutePath, "123"),
        )
    }

    @Test
    fun `strips alpha and beta suffixes from the version parts`() {
        val version = getManifestVersionString("119.0a1", tempDir.absolutePath, "20250115143000")
        assertEquals("119.0.20250115.143000", version)
    }
}
