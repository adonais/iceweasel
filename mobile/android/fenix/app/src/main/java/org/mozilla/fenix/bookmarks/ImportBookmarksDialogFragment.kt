/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.DialogFragment
import androidx.fragment.compose.content
import mozilla.appservices.places.BookmarkRoot
import mozilla.components.concept.bookmark.parser.BookmarksFileParser
import mozilla.components.concept.bookmarks.file.BookmarksFileImporter
import mozilla.components.feature.importer.BookmarkImporter
import mozilla.components.feature.importer.ImporterEvent
import mozilla.components.lib.bookmark.parser.jsoup.jsoupParser
import mozilla.components.lib.bookmarks.file.htmlImporter
import org.mozilla.fenix.R
import org.mozilla.fenix.bookmarks.importer.FenixBookmarkImporterError
import org.mozilla.fenix.bookmarks.importer.FenixImporterEvent
import org.mozilla.fenix.bookmarks.importer.toFenixError
import org.mozilla.fenix.ext.requireComponents

internal class ImportBookmarksDialogFragment : DialogFragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = content {
        BookmarkImporter(
            importer = BookmarksFileImporter.htmlImporter(
                context = requireContext(),
                parentGuid = BookmarkRoot.Mobile.id,
                parser = BookmarksFileParser.jsoupParser(
                    rootFolderName = requireContext().getString(R.string.bookmark_import_destination_default_name),
                ),
                inserter = requireComponents.core.bookmarksStorage,
            ),
            onEventReceived = { event ->
                parentFragmentManager.setFragmentResult(
                    REQUEST_KEY,
                    event.resultBundle(),
                )
                dismissWhenFinished(event)
            },
        )
    }

    private fun dismissWhenFinished(event: ImporterEvent) {
        if (event !is ImporterEvent.Started) {
            dismiss()
        }
    }

    companion object {
        const val REQUEST_KEY = "import_bookmarks_request"
        const val KEY_RESULT = "result"
        const val KEY_ERROR_TYPE = "result_error_type"
        const val KEY_SUCCESS_IMPORT_COUNT = "result_success_import_count"
        internal const val RESULT_STARTED = "started"
        internal const val RESULT_SUCCESS = "success"
        internal const val RESULT_FAILURE = "failure"
        internal const val RESULT_CANCELLED = "cancelled"
        const val TAG = "import_dialog"

        fun decodeResult(bundle: Bundle): FenixImporterEvent? =
            when (bundle.getString(KEY_RESULT)) {
                RESULT_STARTED -> FenixImporterEvent.Started
                RESULT_SUCCESS -> FenixImporterEvent.Success(
                    importCount = bundle.getInt(KEY_SUCCESS_IMPORT_COUNT, 0),
                )

                RESULT_FAILURE -> {
                    val errorOrdinal = bundle.getInt(KEY_ERROR_TYPE, FenixBookmarkImporterError.UNKNOWN_ERROR.ordinal)
                    FenixImporterEvent.Failure(error = FenixBookmarkImporterError.entries[errorOrdinal])
                }

                RESULT_CANCELLED -> FenixImporterEvent.Canceled
                else -> null
            }
    }
}

private fun ImporterEvent.resultBundle(): Bundle {
    val status = when (this) {
        is ImporterEvent.Started -> ImportBookmarksDialogFragment.RESULT_STARTED
        is ImporterEvent.Success -> ImportBookmarksDialogFragment.RESULT_SUCCESS
        is ImporterEvent.Failure -> ImportBookmarksDialogFragment.RESULT_FAILURE
        is ImporterEvent.Canceled -> ImportBookmarksDialogFragment.RESULT_CANCELLED
    }

    val importCount = (this as? ImporterEvent.Success)?.importCount
    val error = (this as? ImporterEvent.Failure)?.error?.toFenixError()

    return Bundle().apply {
        putString(ImportBookmarksDialogFragment.KEY_RESULT, status)
        importCount?.let {
            putInt(ImportBookmarksDialogFragment.KEY_SUCCESS_IMPORT_COUNT, it)
        }
        error?.let {
            putInt(ImportBookmarksDialogFragment.KEY_ERROR_TYPE, error.ordinal)
        }
    }
}
