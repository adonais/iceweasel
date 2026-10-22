/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.annotation.VisibleForTesting
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.ComposeView
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.core.Action
import org.mozilla.fenix.compose.snackbar.Snackbar
import org.mozilla.fenix.compose.snackbar.SnackbarState

/**
 * The message shown once a failed photo picker upload has brought the camera back.
 *
 * @param context Context to read the strings from.
 * @param reason Which step of the upload failed.
 * @param onRetry Uploads the same image again. Offered only when the upload itself failed, as retrying an image that
 *   couldn't be read would fail the same way.
 */
internal fun lensUploadFailureSnackbarState(
    context: Context,
    reason: LensUploadFailure,
    onRetry: () -> Unit,
): SnackbarState =
    when (reason) {
        LensUploadFailure.IMAGE_LOAD ->
            SnackbarState(message = context.getString(R.string.lens_camera_image_load_failed))
        LensUploadFailure.UPLOAD ->
            SnackbarState(
                message = context.getString(R.string.lens_camera_upload_failed),
                action =
                    Action(
                        label = context.getString(R.string.lens_camera_upload_failed_retry_button),
                        onClick = onRetry,
                    ),
            )
    }

/**
 * Uploads photo picker images for [LensCameraActivity] behind [LensUploadLoadingScreen], which covers the camera until
 * the upload succeeds, fails or is cancelled. A successful upload finishes the activity with the Lens result URL.
 *
 * @param activity The activity whose camera the loading screen covers.
 * @param viewModel Runs the upload across configuration changes.
 * @param overlay The view the loading screen is composed into.
 * @param removeCamera Takes the camera down as the loading screen goes up.
 * @param restoreCamera Brings the camera back once a cancelled or failed upload has taken the loading screen down.
 */
internal class LensUploadOverlay(
    private val activity: ComponentActivity,
    private val viewModel: LensUploadViewModel,
    private val overlay: ComposeView,
    private val removeCamera: () -> Unit,
    private val restoreCamera: () -> Unit,
) {

    @VisibleForTesting
    internal var failureSnackbar: Snackbar? = null
        private set

    @VisibleForTesting
    internal var failureSnackbarState: SnackbarState? = null
        private set

    /**
     * Uploads the image at [imageUri].
     *
     * @param imageUri The photo picker image to upload.
     * @param isPrivate Whether the upload runs in the private cookie context.
     */
    fun start(imageUri: Uri, isPrivate: Boolean) {
        // The snackbar sits above the overlay, so it would otherwise cover the loading screen.
        failureSnackbar?.dismiss()
        // Shown first, so an upload that settles straight away finds the overlay to take down.
        show(animateIn = true)
        viewModel.start(imageUri, isPrivate)
    }

    /** Puts the loading screen back up after a recreation mid-upload, then handles how uploads end. */
    fun observe() {
        if (viewModel.state.value.coversCamera) {
            show(animateIn = false)
        }
        activity.lifecycleScope.launch {
            // Handled only while started, so a failure snackbar never shows over another app and a result that arrives
            // in the background is opened once the user comes back.
            activity.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    when (state) {
                        is LensUploadState.Succeeded -> finishWithLensResult(state)
                        is LensUploadState.Failed -> handleFailure(state)
                        else -> Unit
                    }
                }
            }
        }
    }

    private fun show(animateIn: Boolean) {
        removeCamera()
        if (overlay.isVisible) return
        // Not wrapped in FirefoxTheme, matching LensCameraScreen: the camera surfaces use fixed colors.
        overlay.setContent {
            val state by viewModel.state.collectAsState()
            val visual =
                when (val current = state) {
                    is LensUploadState.Loading -> current.visual
                    is LensUploadState.Succeeded -> current.visual
                    else -> null
                }
            // Always enabled while the overlay is up: cancel ignores a press once the upload has settled.
            BackHandler { cancel() }
            LensUploadLoadingScreen(
                preview = visual?.preview,
                backdrop = visual?.backdrop,
                animateIn = animateIn,
                onCancel = ::cancel,
            )
        }
        overlay.isVisible = true
    }

    private fun hide() {
        if (!overlay.isVisible) return
        overlay.isVisible = false
        overlay.disposeComposition()
    }

    /** Stops the upload and brings the camera back. Ignored once the upload has finished, e.g. during the exit fade. */
    private fun cancel() {
        if (!activity.isFinishing && viewModel.cancel()) {
            returnToCamera()
        }
    }

    private fun handleFailure(failure: LensUploadState.Failed) {
        viewModel.onFailureHandled()
        // Shown once the camera is back, so the message lands on the screen the user can act on.
        returnToCamera()
        val state =
            lensUploadFailureSnackbarState(activity, failure.reason) {
                if (!activity.isFinishing) {
                    start(failure.imageUri, failure.isPrivate)
                }
            }
        failureSnackbarState = state
        failureSnackbar = Snackbar.make(overlay, state).also { it.show() }
    }

    /** Brings the camera back itself, as a cancelled or failed upload doesn't pass through onResume. */
    private fun returnToCamera() {
        hide()
        restoreCamera()
    }

    private fun finishWithLensResult(state: LensUploadState.Succeeded) {
        if (activity.isFinishing) return
        activity.setResult(
            Activity.RESULT_OK,
            Intent().apply {
                putExtra(LensCameraActivity.EXTRA_LENS_RESULT_URL, state.resultUrl)
                putExtra(LensCameraActivity.EXTRA_IS_PRIVATE, state.isPrivate)
            },
        )
        // Fading out keeps the picked image on screen while the host opens the result underneath.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, 0, R.anim.fade_out)
            activity.finish()
        } else {
            activity.finish()
            @Suppress("DEPRECATION") activity.overridePendingTransition(0, R.anim.fade_out)
        }
    }
}
