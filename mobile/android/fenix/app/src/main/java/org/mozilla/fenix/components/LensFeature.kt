/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.settings
import java.io.File
import java.io.IOException

/**
 * Handles Google Lens image search requests and results.
 * - Observes Lens requests from the AppStore.
 * - Launches an image chooser (gallery + camera) and uploads the selected image.
 * - Dispatches the resulting Lens URL back to AppStore.
 */
class LensFeature(
    private val context: Context,
    private val appStore: AppStore,
    private val lensLauncher: ActivityResultLauncher<Intent>,
    private val uploader: LensImageUploader,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) : LifecycleAwareFeature {

    private var scope: CoroutineScope? = null
    private var pendingCameraUri: Uri? = null
    private var pendingCameraFile: File? = null

    override fun start() {
        observeLensRequests()
    }

    override fun stop() {
        scope?.cancel()
        scope = null
        cleanupPendingFile()
    }

    private fun observeLensRequests() {
        scope = appStore.flowScoped(dispatcher = mainDispatcher) { flow ->
            flow.map { state -> state.lensState }
                .distinctUntilChangedBy { it.isRequesting }
                .collect { lensState ->
                    if (lensState.isRequesting) {
                        appStore.dispatch(LensAction.LensRequestConsumed)
                        launchImageChooser()
                    }
                }
        }
    }

    private fun launchImageChooser() {
        val galleryIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
        }

        val imageDir = File(context.cacheDir, LENS_IMAGES_DIR)
        imageDir.mkdirs()
        val imageFile = File(imageDir, "lens_capture_${System.currentTimeMillis()}.jpg")
        val cameraUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.lens.fileprovider",
            imageFile,
        )
        pendingCameraUri = cameraUri
        pendingCameraFile = imageFile

        val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
        }
        val chooserIntent = Intent.createChooser(galleryIntent, null).apply {
            putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
        }
        try {
            lensLauncher.launch(chooserIntent)
        } catch (e: ActivityNotFoundException) {
            pendingCameraUri = null
            pendingCameraFile = null
            appStore.dispatch(LensAction.LensDismissed)
        }
    }

    /**
     * Handles the result of the image chooser activity.
     */
    fun handleImageResult(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK) {
            handleFailureDismiss()
            return
        }

        val imageUri = data?.data ?: pendingCameraUri
        pendingCameraUri = null
        if (imageUri == null) {
            handleFailureDismiss()
            return
        }

        val currentScope = scope
        if (currentScope == null) {
            handleFailureDismiss()
            return
        }

        currentScope.launch {
            try {
                val resultUrl = uploader.upload(imageUri)
                if (resultUrl != null) {
                    appStore.dispatch(LensAction.LensResultAvailable(resultUrl))
                } else {
                    appStore.dispatch(LensAction.LensDismissed)
                }
            } catch (e: IOException) {
                appStore.dispatch(LensAction.LensDismissed)
            } finally {
                cleanupPendingFile()
            }
        }
    }

    private fun handleFailureDismiss() {
        appStore.dispatch(LensAction.LensDismissed)
        cleanupPendingFile()
    }

    private fun cleanupPendingFile() {
        pendingCameraFile?.delete()
        pendingCameraFile = null
    }

    companion object {
        private const val LENS_IMAGES_DIR = "lens_images"

        /**
         * Registers [LensFeature] with a [Fragment].
         * Returns null if the Google Lens integration is disabled.
         */
        fun register(
            fragment: Fragment,
            activityResultLauncher: ActivityResultLauncher<Intent>,
        ): ViewBoundFeatureWrapper<LensFeature>? {
            if (!fragment.requireContext().settings().googleLensIntegrationEnabled) {
                return null
            }

            var lensBinding: ViewBoundFeatureWrapper<LensFeature>? = ViewBoundFeatureWrapper()

            lensBinding?.set(
                feature = LensFeature(
                    context = fragment.requireContext(),
                    appStore = fragment.requireContext().components.appStore,
                    lensLauncher = activityResultLauncher,
                    uploader = LensImageUploader(
                        context = fragment.requireContext(),
                        client = fragment.requireContext().components.core.client,
                        userAgent = fragment.requireContext().components.core.engine.settings.userAgentString ?: "",
                    ),
                ),
                owner = fragment.viewLifecycleOwner,
                view = fragment.requireView(),
            )

            fragment.viewLifecycleOwner.lifecycle.addObserver(
                object : androidx.lifecycle.DefaultLifecycleObserver {
                    override fun onDestroy(owner: LifecycleOwner) {
                        lensBinding = null
                    }
                },
            )

            return lensBinding
        }
    }
}
