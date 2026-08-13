/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.license

import android.graphics.Typeface
import android.os.Bundle
import android.text.util.Linkify
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import androidx.annotation.RawRes
import androidx.annotation.VisibleForTesting
import androidx.fragment.app.Fragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import mozilla.components.support.license.databinding.FragmentLibrariesListBinding
import mozilla.components.ui.widgets.withCenterAlignedButtons
import java.util.Locale

/**
 * Displays the licenses of all the libraries used by the app.
 *
 * This is a re-implementation of the play-services-oss-licenses library,
 * which cannot be used in OSS builds because it is proprietary and closed-source.
 * It uses Google's gradle plugin to extract the dependencies and their licenses,
 * and displays them to the end-user.
 */
abstract class LibrariesListFragment : Fragment(R.layout.fragment_libraries_list) {

    /**
     * The resource location for the license information.
     *
     * @property licenses the license data.
     * @property metadata the information needed to parse the [licenses] file.
     */
    data class LicenseData(
        @param:RawRes val licenses: Int,
        @param:RawRes val metadata: Int,
    )

    /**
     * Required data from the app that was generated using the OSS license plugin.
     */
    abstract val licenseData: LicenseData

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val binding = FragmentLibrariesListBinding.bind(view)
        setupLibrariesListView(binding.aboutLibrariesListview)
    }

    private fun setupLibrariesListView(listView: ListView) {
        val libraries = loadLibraries()
        listView.adapter = ArrayAdapter(
            listView.context,
            android.R.layout.simple_list_item_1,
            libraries,
        )
        listView.setOnItemClickListener { _, _, position, _ ->
            showLicenseDialog(libraries[position])
        }
    }

    private fun loadLibraries(): List<LibraryItem> {
        val licensesData = resources
            .openRawResource(licenseData.licenses)
            .use { it.readBytes() }
        val metadataLines = resources
            .openRawResource(licenseData.metadata)
            .bufferedReader()
            .use { reader -> reader.readLines() }
        return parseLibraries(licensesData, metadataLines)
    }

    private fun showLicenseDialog(libraryItem: LibraryItem) {
        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle(libraryItem.name)
            .setMessage(libraryItem.license)
            .create()
            .withCenterAlignedButtons()
        dialog.show()

        val textView = dialog.findViewById<TextView>(android.R.id.message)!!
        Linkify.addLinks(textView, Linkify.WEB_URLS)
        textView.linksClickable = true
        textView.textSize = LICENSE_TEXT_SIZE
        textView.typeface = Typeface.MONOSPACE
    }

    companion object {
        private const val LICENSE_TEXT_SIZE = 10F
    }
}

/**
 * Parses the "oss-licenses-plugin" raw resources into a sorted, de-duplicated list of libraries.
 *
 * [licensesData] is the binary concatenation of every license text; [metadataLines] holds one
 * entry per line formatted "[start_offset]:[length] [name]" pointing into that blob. Lines that
 * don't match this format or point out of bounds are skipped rather than throwing.
 *
 * See https://github.com/google/play-services-plugins/tree/main/oss-licenses-plugin
 */
@VisibleForTesting
internal fun parseLibraries(
    licensesData: ByteArray,
    metadataLines: List<String>,
): List<LibraryItem> =
    metadataLines.mapNotNull { line -> parseLibraryLine(licensesData, line) }
        .distinctBy { it.name.lowercase(Locale.ROOT) }
        .sortedBy { it.name.lowercase(Locale.ROOT) }

private fun parseLibraryLine(licensesData: ByteArray, line: String): LibraryItem? {
    val (section, name) = line.split(" ", limit = 2).takeIf { it.size == 2 } ?: return null
    if (name.isBlank()) return null
    val (startText, lengthText) = section.split(":", limit = 2).takeIf { it.size == 2 } ?: return null
    val startOffset = startText.toIntOrNull() ?: return null
    val length = lengthText.toIntOrNull() ?: return null
    if (startOffset < 0 || length < 0 || startOffset.toLong() + length > licensesData.size) {
        return null
    }
    val licenseText = licensesData
        .sliceArray(startOffset until startOffset + length)
        .toString(Charsets.UTF_8)
    return LibraryItem(name, licenseText)
}

internal class LibraryItem(val name: String, val license: String) {
    override fun toString(): String {
        return name
    }
}
