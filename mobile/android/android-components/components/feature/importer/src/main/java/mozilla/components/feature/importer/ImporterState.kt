/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.importer

import mozilla.components.concept.bookmarks.file.BookmarksImporterError
import mozilla.components.lib.state.State

/**
 * State for the bookmark importer feature.
 */
sealed interface ImporterState : State {
    /** The importer has not yet been triggered. */
    object Inert : ImporterState

    /** The user is being prompted to pick a file. */
    object SelectingFile : ImporterState

    /** An import is in progress. */
    object Loading : ImporterState

    /**
     * The import has completed.
     *
     * @property result The outcome of the import.
     */
    data class Finished(val result: ImporterEvent) : ImporterState
}

/**
 * Represents a discrete event emitted by the importer during the import lifecycle.
 */
sealed interface ImporterEvent {
    /** The import process has started. */
    data object Started : ImporterEvent

    /**
     * The import succeeded.
     *
     * @property importCount The number of items imported.
     */
    data class Success(val importCount: Int) : ImporterEvent

    /** The import failed due to an error. */
    data class Failure(val error: BookmarksImporterError) : ImporterEvent

    /** The user cancelled the import. */
    data object Canceled : ImporterEvent
}
