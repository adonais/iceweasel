/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.graphics.Bitmap
import android.net.Uri
import androidx.annotation.VisibleForTesting
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.scale
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlin.math.max
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.mozilla.fenix.components.LensImageUploader

private const val BACKDROP_MAX_DIMENSION = 32

/**
 * What [LensUploadLoadingScreen] draws for the image being uploaded.
 *
 * @property preview The picked image, upright and subsampled to the upload size.
 * @property backdrop A tiny copy of [preview], stretched over the screen so it reads as blurred.
 */
internal data class LensUploadVisual(
    val preview: ImageBitmap,
    val backdrop: ImageBitmap,
)

/** State of a photo picker upload run by [LensUploadViewModel]. */
internal sealed interface LensUploadState {
    /** No upload is running; the camera is shown. */
    data object Idle : LensUploadState

    /**
     * The image is being decoded or uploaded.
     *
     * @property visual The image to show, or null while it is still being decoded.
     */
    data class Loading(val visual: LensUploadVisual?) : LensUploadState

    /**
     * The upload produced a Lens result. [visual] stays on screen while the activity fades out.
     *
     * @property resultUrl The Lens results URL.
     * @property isPrivate The browsing mode the image was uploaded in.
     * @property visual The image shown while uploading.
     */
    data class Succeeded(
        val resultUrl: String,
        val isPrivate: Boolean,
        val visual: LensUploadVisual,
    ) : LensUploadState

    /**
     * The upload produced no Lens result.
     *
     * @property reason Which step failed, so the user can be told whether to pick another image or try again.
     * @property imageUri The photo picker image that failed, so the upload can be retried.
     * @property isPrivate The browsing mode the image was uploaded in.
     */
    data class Failed(
        val reason: LensUploadFailure,
        val imageUri: Uri,
        val isPrivate: Boolean,
    ) : LensUploadState
}

/** Why a photo picker upload produced no Lens result. */
internal enum class LensUploadFailure {
    /** The picked image couldn't be read or decoded, so nothing was sent to Lens. */
    IMAGE_LOAD,

    /** The upload didn't reach Lens, or Lens answered without a result. */
    UPLOAD,
}

/** Whether an upload is covering the camera. */
internal val LensUploadState.coversCamera: Boolean
    get() = this is LensUploadState.Loading || this is LensUploadState.Succeeded

/**
 * Uploads a photo picker image to Google Lens for [LensCameraActivity], keeping the upload and the decoded image across
 * configuration changes.
 *
 * A [ViewModel] rather than a lib-state Store: the upload needs a scope that survives recreation and is cancelled once
 * the activity finishes. [viewModelScope] is that scope, while `StoreProvider.activityStore` retains a Store but gives
 * its middleware no scope. [org.mozilla.fenix.perf.ProfilerViewModel] backs
 * [org.mozilla.fenix.perf.StopProfilerActivity] the same way, and
 * [org.mozilla.fenix.summarization.SummarizationStoreViewModel] is a ViewModel for its [viewModelScope] too.
 *
 * @param uploaderProvider Supplies the uploader lazily, so creating the view model never touches the engine.
 * @param mainDispatcher Dispatcher the upload is coordinated on.
 * @param backgroundDispatcher Dispatcher the backdrop is scaled on.
 */
internal class LensUploadViewModel(
    uploaderProvider: () -> LensImageUploader,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val backgroundDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val uploader by lazy(uploaderProvider)
    private var uploadJob: Job? = null

    private val _state = MutableStateFlow<LensUploadState>(LensUploadState.Idle)
    val state: StateFlow<LensUploadState> = _state.asStateFlow()

    /**
     * Uploads the image at [imageUri], replacing any upload already running.
     *
     * @param imageUri The photo picker image to upload.
     * @param isPrivate Whether the upload runs in the private cookie context.
     */
    fun start(imageUri: Uri, isPrivate: Boolean) {
        uploadJob?.cancel()
        _state.value = LensUploadState.Loading(visual = null)
        uploadJob = viewModelScope.launch(mainDispatcher) { _state.value = upload(imageUri, isPrivate) }
    }

    /**
     * Stops the running upload. Nothing is recorded, as the search didn't run to completion.
     *
     * @return Whether an upload was running. False once it has already succeeded or failed.
     */
    fun cancel(): Boolean {
        if (_state.value !is LensUploadState.Loading) return false
        uploadJob?.cancel()
        uploadJob = null
        _state.value = LensUploadState.Idle
        return true
    }

    /** Acknowledges [LensUploadState.Failed] once the activity has told the user. */
    fun onFailureHandled() {
        if (_state.value is LensUploadState.Failed) {
            _state.value = LensUploadState.Idle
        }
    }

    private suspend fun upload(imageUri: Uri, isPrivate: Boolean): LensUploadState {
        var visual: LensUploadVisual? = null
        val resultUrl =
            runLensUpload(source = LensCameraActivity.IMAGE_SOURCE_PHOTO_PICKER) {
                    uploader.decodeImage(imageUri)?.let { image ->
                        visual = withContext(backgroundDispatcher) { image.toUploadVisual() }
                        _state.value = LensUploadState.Loading(visual)
                        uploader.uploadImage(image, isPrivate)
                    }
                }
                ?.resultUrl

        // The visual is only set once the image has been decoded, so without one the image itself was the problem.
        val shownVisual = visual
        return when {
            shownVisual == null -> LensUploadState.Failed(LensUploadFailure.IMAGE_LOAD, imageUri, isPrivate)
            resultUrl == null -> LensUploadState.Failed(LensUploadFailure.UPLOAD, imageUri, isPrivate)
            else -> LensUploadState.Succeeded(resultUrl, isPrivate, shownVisual)
        }
    }

    private fun Bitmap.toUploadVisual() =
        LensUploadVisual(preview = asImageBitmap(), backdrop = shrinkForBackdrop(this).asImageBitmap())

    /** Factory for [LensUploadViewModel], with the same parameters. */
    class Factory(
        private val uploaderProvider: () -> LensImageUploader,
        private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
        private val backgroundDispatcher: CoroutineDispatcher = Dispatchers.Default,
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(LensUploadViewModel::class.java)) { "Unknown ViewModel class" }
            @Suppress("UNCHECKED_CAST")
            return LensUploadViewModel(uploaderProvider, mainDispatcher, backgroundDispatcher) as T
        }
    }
}

/**
 * Shrinks [image] until neither side exceeds [BACKDROP_MAX_DIMENSION], halving at each step: a single large downscale
 * samples too few pixels and aliases instead of averaging the image into soft color.
 */
@VisibleForTesting
internal fun shrinkForBackdrop(image: Bitmap): Bitmap {
    var shrunk = image
    while (max(shrunk.width, shrunk.height) > BACKDROP_MAX_DIMENSION) {
        val next = shrunk.scale((shrunk.width / 2).coerceAtLeast(1), (shrunk.height / 2).coerceAtLeast(1))
        if (shrunk !== image) shrunk.recycle()
        shrunk = next
    }
    return shrunk
}
