/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DebugInfoJsonTest {

    @Test
    fun `WHEN the section list is empty THEN an empty JSON object is returned`() {
        val json = emptyList<DebugInfoSection>().toJson()

        assertEquals("{}", json)
    }

    @Test
    fun `WHEN a section contains text items THEN they are serialized as label to value pairs`() {
        val sections = listOf(
            DebugInfoSection(
                title = "Build",
                items = listOf(
                    DebugInfoItem("Version", DebugInfoValue.Text("142.0")),
                    DebugInfoItem("GeckoView", DebugInfoValue.Text("142.0-20250101")),
                ),
            ),
        )

        val json = JSONObject(sections.toJson()).getJSONObject("Build")

        assertEquals("142.0", json.getString("Version"))
        assertEquals("142.0-20250101", json.getString("GeckoView"))
    }

    @Test
    fun `WHEN a section contains state items THEN they are serialized as booleans`() {
        val sections = listOf(
            DebugInfoSection(
                title = "Settings",
                items = listOf(
                    DebugInfoItem("topSitesEnabled", DebugInfoValue.State(enabled = true)),
                    DebugInfoItem("vpnEnabled", DebugInfoValue.State(enabled = false)),
                ),
            ),
        )

        val settings = JSONObject(sections.toJson()).getJSONObject("Settings")

        assertTrue(settings.getBoolean("topSitesEnabled"))
        assertFalse(settings.getBoolean("vpnEnabled"))
    }

    @Test
    fun `WHEN there are multiple sections THEN each is a top level object keyed by its title`() {
        val sections = listOf(
            DebugInfoSection(
                title = "Build",
                items = listOf(
                    DebugInfoItem("Version", DebugInfoValue.Text("142.0")),
                    DebugInfoItem("Debuggable", DebugInfoValue.State(enabled = false)),
                ),
            ),
            DebugInfoSection(
                title = "Device",
                items = listOf(
                    DebugInfoItem("Model", DebugInfoValue.Text("Pixel 9")),
                ),
            ),
        )

        val json = JSONObject(sections.toJson())

        assertTrue(json.has("Build"))
        assertTrue(json.has("Device"))
        assertEquals("142.0", json.getJSONObject("Build").getString("Version"))
        assertFalse(json.getJSONObject("Build").getBoolean("Debuggable"))
        assertEquals("Pixel 9", json.getJSONObject("Device").getString("Model"))
    }
}
