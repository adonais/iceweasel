/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.net.Uri
import androidx.annotation.VisibleForTesting
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import mozilla.components.concept.engine.EngineSession
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.GleanMetrics.GoogleLens
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.LensImageUploader
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases

/**
 * Uploads an image to Google Lens and opens the result, for every Google Lens entry point.
 *
 * Keep this application scoped. [LensCameraActivity] covers, and on low memory devices outlives, the host fragment, so
 * neither the upload nor the tab it opens can depend on a view lifecycle.
 *
 * @param appStore Provides the browsing mode and receives the result of the search.
 * @param uploader Supplies the uploader lazily, so constructing this never touches the engine.
 * @param browserUseCases Supplies the use cases lazily, for the same reason.
 * @param scope Application scoped coroutine scope the uploads run in.
 */
class LensImageSearch(
    private val appStore: AppStore,
    private val uploader: () -> LensImageUploader,
    private val browserUseCases: () -> FenixBrowserUseCases,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {

    private val logger = Logger("LensImageSearch")
    private var searchJob: Job? = null

    /**
     * Uploads a camera capture or photo picker selection and opens the Lens result.
     *
     * @param imageUri Location of the image to upload.
     * @param source Upload method the image came from, recorded as telemetry.
     */
    fun searchWithImage(imageUri: Uri, source: String) {
        search(source, isObserved = true) { isPrivate -> uploader().upload(imageUri, isPrivate) }
    }

    /** Fetches the image at [imageUrl], uploads it, and opens the Lens result. */
    fun searchWithImageUrl(imageUrl: String) {
        search(SOURCE_CONTEXT_MENU, isObserved = false) { isPrivate -> uploader().uploadFromUrl(imageUrl, isPrivate) }
    }

    /**
     * Uploads an image and opens the Lens result in a new tab.
     *
     * @param source Upload method the image came from, recorded as telemetry.
     * @param isObserved Whether BrowserToolbarSearchMiddleware is observing the result of this search, which is only
     *   the case for searches it started from the toolbar's Lens button.
     * @param upload Performs the upload for the given browsing mode.
     */
    private fun search(
        source: String,
        isObserved: Boolean,
        upload: suspend (isPrivate: Boolean) -> LensImageUploader.UploadResult,
    ) {
        // The newest request wins. Two in-flight uploads would open two tabs and race to write the result.
        searchJob?.cancel()
        searchJob = scope.launch {
            val isPrivate = appStore.state.mode.isPrivate

            val uploadResult =
                try {
                    upload(isPrivate)
                } catch (e: IOException) {
                    logger.warn("Google Lens upload failed", e)
                    null
                } catch (e: SecurityException) {
                    // The photo picker's URI grant can be gone by the time the upload reads it.
                    logger.warn("Google Lens upload failed to read the image", e)
                    null
                }

            val resultUrl = uploadResult?.resultUrl
            recordSearchCompleted(
                succeeded = resultUrl != null,
                source = source,
                httpStatusCode = uploadResult?.httpStatusCode,
            )

            if (resultUrl == null) {
                appStore.dispatch(LensAction.LensDismissed)
                return@launch
            }

            // Always a new tab. The tab the search started from may be gone by now, and a Lens
            // result shouldn't replace the page the user was reading.
            browserUseCases()
                .loadUrlOrSearch(
                    searchTermOrURL = resultUrl,
                    newTab = true,
                    private = isPrivate,
                    flags = EngineSession.LoadUrlFlags.external(),
                )
            // The observed flow leaves the result in the store for BrowserToolbarSearchMiddleware, which navigates
            // to the browser and then dispatches LensResultConsumed. Nothing observes the other flows, so they clear
            // the state themselves rather than leaving a stale result behind.
            appStore.dispatch(
                if (isObserved) LensAction.LensResultAvailable(resultUrl) else LensAction.LensResultConsumed
            )
        }
    }

    private fun recordSearchCompleted(succeeded: Boolean, source: String, httpStatusCode: Int? = null) {
        GoogleLens.searchCompleted.record(
            GoogleLens.SearchCompletedExtra(
                succeeded = succeeded,
                httpStatusCode = httpStatusCode,
                source = source,
            )
        )
    }

    companion object {
        @VisibleForTesting internal const val SOURCE_CONTEXT_MENU = "context_menu"

        internal const val SOURCE_UNKNOWN = "unknown"
    }
}
