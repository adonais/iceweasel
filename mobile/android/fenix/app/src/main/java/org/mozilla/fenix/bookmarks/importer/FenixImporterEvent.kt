/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks.importer

/**
 * Fenix equivalent of [mozilla.components.feature.importer.ImporterEvent]
 *
 * This is needed because we are sending the result from [org.mozilla.fenix.bookmarks.ImportBookmarksDialogFragment]
 * to [org.mozilla.fenix.bookmarks.BookmarkFragment] through bundles, and we need a simplified result object that
 * is easily serializable and deserializable.
 *
 * Main difference here is [FenixImporterEvent.Failure] which maps
 * [mozilla.components.concept.bookmarks.file.BookmarksImporterError] into a simple enum of possible error states
 * represented by [FenixBookmarkImporterError]
 */
sealed interface FenixImporterEvent {
    /** The import process has started. */
    data object Started : FenixImporterEvent

    /**
     * The import succeeded.
     *
     * @property importCount The number of items imported.
     */
    data class Success(val importCount: Int) : FenixImporterEvent

    /** The import failed due to an error. */
    data class Failure(val error: FenixBookmarkImporterError) : FenixImporterEvent

    /** The user cancelled the import. */
    data object Canceled : FenixImporterEvent
}
