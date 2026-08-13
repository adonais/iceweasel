/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info

import android.util.JsonWriter
import mozilla.components.support.base.log.logger.Logger
import java.io.IOException
import java.io.StringWriter

private const val JSON_INDENT = "   "

/**
 * Serializes the debug info [DebugInfoSection]s into a JSON string.
 */
internal fun List<DebugInfoSection>.toJson(): String {
    val stringWriter = StringWriter()

    try {
        JsonWriter(stringWriter).use { writer ->
            writer.setIndent(JSON_INDENT)
            writer.writeSections(sections = this)
        }
    } catch (e: IOException) {
        Logger.warn("Could not serialize the debug info", e)
    }

    return stringWriter.toString()
}

private fun JsonWriter.writeSections(sections: List<DebugInfoSection>) {
    beginObject()

    sections.forEach { section ->
        name(section.title)

        beginObject()

        section.items.forEach { writeItem(item = it) }

        endObject()
    }

    endObject()
}

private fun JsonWriter.writeItem(item: DebugInfoItem) {
    name(item.label)

    when (val value = item.value) {
        is DebugInfoValue.Text -> value(value.text)
        is DebugInfoValue.State -> value(value.enabled)
    }
}
