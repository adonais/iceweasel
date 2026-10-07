/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.map
import mozilla.components.feature.qr.QrScanActivity
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.AppAction.LensAction
import org.mozilla.fenix.components.lens.LensCameraActivity
import org.mozilla.fenix.components.lens.LensImageSearch
import org.mozilla.fenix.ext.components

/**
 * Handles Google Lens image search requests.
 * - Observes Lens requests from the AppStore.
 * - Launches the Lens camera screen.
 * - Forwards the selected image to [LensImageSearch], which uploads it and opens the result.
 */
class LensFeature(
    private val context: Context,
    private val appStore: AppStore,
    private val lensLauncher: ActivityResultLauncher<Intent>,
    private val cameraPermissionLauncher: ActivityResultLauncher<String>,
    private val lensImageSearch: LensImageSearch,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val permissionChecker: (Context, String) -> Int = ContextCompat::checkSelfPermission,
    private val hasAcknowledgedOptOut: () -> Boolean = {
        context.components.settings.hasAcceptedGoogleLensFirstRun
    },
) : LifecycleAwareFeature {

    private var scope: CoroutineScope? = null

    override fun start() {
        observeLensRequests()
    }

    override fun stop() {
        scope?.cancel()
        scope = null
    }

    private fun observeLensRequests() {
        scope =
            appStore.flowScoped(dispatcher = mainDispatcher) { flow ->
                flow
                    .map { state -> state.lensState }
                    .distinctUntilChangedBy { it.isRequesting }
                    .collect { lensState ->
                        if (lensState.isRequesting) {
                            val pendingImageUrl = lensState.pendingImageUrl
                            appStore.dispatch(LensAction.LensRequestConsumed)
                            if (pendingImageUrl != null) {
                                lensImageSearch.searchWithImageUrl(pendingImageUrl)
                            } else {
                                launchCamera()
                            }
                        }
                    }
            }
    }

    private fun launchCamera() {
        if (!hasAcknowledgedOptOut()) {
            // The opt-out bottom sheet has to be seen before any permission prompt;
            // LensCameraActivity requests the permission itself once the user accepts.
            launchCameraActivity()
        } else if (permissionChecker(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCameraActivity()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchCameraActivity() {
        val intent = LensCameraActivity.newIntent(context)
        try {
            lensLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            appStore.dispatch(LensAction.LensDismissed)
        }
    }

    /** Handles the result of the camera permission request initiated by [launchCamera]. */
    fun onCameraPermissionResult(isGranted: Boolean) {
        if (isGranted) {
            launchCameraActivity()
        } else {
            Toast.makeText(context, R.string.lens_camera_permission_denied, Toast.LENGTH_SHORT).show()
            appStore.dispatch(LensAction.LensDismissed)
        }
    }

    /**
     * Routes the result of the Lens camera activity. If the result intent carries a QR scan payload (from the in-camera
     * QR mode), dismisses the Lens flow and forwards the result to [qrScanFeature]; otherwise treats it as an image
     * capture and delegates to [handleImageResult].
     */
    fun handleCameraActivityResult(
        resultCode: Int,
        data: Intent?,
        qrScanFeature: QrScanFenixFeature?,
    ) {
        if (data?.hasExtra(QrScanActivity.EXTRA_SCAN_RESULT_DATA) == true) {
            appStore.dispatch(LensAction.LensDismissed)
            qrScanFeature?.handleToolbarQrScanResults(resultCode, data)
        } else {
            handleImageResult(resultCode, data)
        }
    }

    /**
     * Handles the result of the Lens camera activity.
     *
     * Keep this free of lifecycle guards. The pending activity result is flushed on the fragment's ON_START, which
     * precedes the view lifecycle's, so this runs before [start].
     */
    fun handleImageResult(resultCode: Int, data: Intent?) {
        val imageUri = data?.data
        if (resultCode != Activity.RESULT_OK || imageUri == null) {
            appStore.dispatch(LensAction.LensDismissed)
            return
        }

        lensImageSearch.searchWithImage(
            imageUri = imageUri,
            source = data.getStringExtra(LensCameraActivity.EXTRA_IMAGE_SOURCE) ?: LensImageSearch.SOURCE_UNKNOWN,
        )
    }

    companion object {
        /** Registers [LensFeature] with a [Fragment]. Returns null if the Google Lens integration is disabled. */
        fun register(
            fragment: Fragment,
            activityResultLauncher: ActivityResultLauncher<Intent>,
            cameraPermissionLauncher: ActivityResultLauncher<String>,
        ): ViewBoundFeatureWrapper<LensFeature>? {
            val settings = fragment.requireContext().components.settings
            if (!settings.googleLensIntegrationEnabled || !settings.googleLensIntegrationUserEnabled) {
                return null
            }

            val lensBinding = ViewBoundFeatureWrapper<LensFeature>()

            lensBinding.set(
                feature =
                    LensFeature(
                        context = fragment.requireContext(),
                        appStore = fragment.requireContext().components.appStore,
                        lensLauncher = activityResultLauncher,
                        cameraPermissionLauncher = cameraPermissionLauncher,
                        lensImageSearch = fragment.requireContext().components.lensImageSearch,
                    ),
                owner = fragment.viewLifecycleOwner,
                view = fragment.requireView(),
            )

            return lensBinding
        }
    }
}
