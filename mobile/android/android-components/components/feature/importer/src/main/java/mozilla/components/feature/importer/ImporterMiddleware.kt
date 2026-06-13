/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.importer

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mozilla.components.concept.bookmarks.file.BookmarksFileImporter
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import kotlin.time.Duration.Companion.seconds

/**
 * [Middleware] that handles side-effects for [ImporterAction]s.
 *
 * @param lifecycleScope [CoroutineScope] used to launch import work.
 */
class ImporterMiddleware(
    private val importer: BookmarksFileImporter,
    private val lifecycleScope: CoroutineScope,
) : Middleware<ImporterState, ImporterAction> {
    private var importJob: Job? = null

    override fun invoke(
        store: Store<ImporterState, ImporterAction>,
        next: (ImporterAction) -> Unit,
        action: ImporterAction,
    ) {
        next(action)
        when (action) {
            is ImporterAction.FileSelected -> {
                importJob = lifecycleScope.launch {
                    store.dispatch(ImporterAction.ImportStarted)

                    // We want to make sure we stay in the loading state for at least one second
                    // during an import to prevent the dialog from flashing before the user can
                    // comprehend what is currently happening.
                    val minimumWait = async { delay(1.seconds) }
                    val result = async { importer.importBookmarksFromUri(action.uri) }

                    awaitAll(minimumWait, result)

                    result.await()
                        .onFailure { store.dispatch(ImporterAction.ImportFailed) }
                        .onSuccess { store.dispatch(ImporterAction.ImportFinished(it.count)) }
                }
            }

            is ImporterAction.ImportCancelled -> {
                importJob?.cancel()
                importJob = null
            }

            ImporterAction.FileSelectionCanceled,
            ImporterAction.ImportStarted,
            ImporterAction.ViewAppeared,
            is ImporterAction.ImportFinished,
            ImporterAction.ImportFailed,
                -> Unit
        }
    }
}
