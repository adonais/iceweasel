/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.Manifest.permission.CAMERA
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.DialogInterface
import android.content.Intent
import android.graphics.Typeface
import android.text.style.StyleSpan
import androidx.activity.result.ActivityResultLauncher
import androidx.appcompat.app.AlertDialog
import androidx.core.net.toUri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.map
import mozilla.components.feature.qr.QrScanActivity
import mozilla.components.feature.qr.QrScanActivity.Companion.EXTRA_SCAN_RESULT_DATA
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.base.feature.OnNeedToRequestPermissions
import mozilla.components.support.base.feature.PermissionsFeature
import mozilla.components.support.ktx.android.content.isPermissionGranted
import mozilla.components.support.ktx.android.content.res.getSpanned
import mozilla.components.support.ktx.android.net.isHttpOrHttps
import mozilla.components.support.ktx.kotlin.toNormalizedUrl
import mozilla.components.ui.widgets.withCenterAlignedButtons
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.AppAction.QrScannerAction

/**
 * Handles QR Scan Activity requests and results.
 * - Observes QR scan requests from the AppStore.
 * - Launches QR scan activity and updates AppStore with the result.
 * - Does NOT update any UI or toolbar state directly.
 *
 * Other features (such as toolbar middleware) should observe AppStore for
 * QR scan results and update their own state accordingly.
 */
class QrScanFenixFeature(
    private val context: Context,
    private val appStore: AppStore,
    private val qrScanActivityLauncher: ActivityResultLauncher<Intent>,
    override val onNeedToRequestPermissions: OnNeedToRequestPermissions = { },
) : LifecycleAwareFeature, PermissionsFeature {

    private var scope: CoroutineScope? = null

    override fun start() {
        // observe requests
        observeQrScanRequests()
    }

    override fun stop() {
        scope?.cancel()
        scope = null
    }

    private fun observeQrScanRequests() {
        scope = appStore.flowScoped { flow ->
            flow.map { state -> state.qrScannerState }
                .distinctUntilChangedBy { it.isRequesting }
                .collect { qrScannerState ->
                    if (qrScannerState.isRequesting) {
                        appStore.dispatch(QrScannerAction.QrScannerRequestConsumed)
                        // launch qr scan
                        launchQrScan()
                    }
                }
        }
    }

    private fun launchQrScan() {
        val intent = QrScanActivity.newIntent(context = context)
        try {
            qrScanActivityLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            appStore.dispatch(QrScannerAction.QrScannerDismissed)
        }
    }

    /**
     * Handles the result of the QR scan activity in Toolbar.
     *
     * @param resultCode the result code of the activity
     * @param data the intent data of the activity
     */
    fun handleToolbarQrScanResults(resultCode: Int, data: Intent?) {
        val url = if (resultCode == Activity.RESULT_OK && data != null) {
            data.getStringExtra(EXTRA_SCAN_RESULT_DATA)
        } else {
            null
        }
        if (url != null && url.isNotEmpty()) {
            val normalizedUrl = url.toNormalizedUrl()
            if (!normalizedUrl.toUri().isHttpOrHttps) {
                AlertDialog.Builder(context).apply {
                    setMessage(R.string.qr_scanner_dialog_invalid)
                    setPositiveButton(R.string.qr_scanner_dialog_invalid_ok) { dialog: DialogInterface, _ ->
                        appStore.dispatch(QrScannerAction.QrScannerInputConsumed)
                        dialog.dismiss()
                    }
                    create().withCenterAlignedButtons()
                }.show()
            } else {
                val appName = context.resources.getString(R.string.app_name)
                AlertDialog.Builder(context).apply {
                    val spannable = context.resources.getSpanned(
                        R.string.qr_scanner_confirmation_dialog_message,
                        appName to StyleSpan(Typeface.BOLD),
                        normalizedUrl to StyleSpan(Typeface.ITALIC),
                    )
                    setMessage(spannable)
                    setNegativeButton(R.string.qr_scanner_dialog_negative) { dialog: DialogInterface, _ ->
                        appStore.dispatch(QrScannerAction.QrScannerInputConsumed)
                        dialog.cancel()
                    }
                    setPositiveButton(R.string.qr_scanner_dialog_positive) { dialog: DialogInterface, _ ->
                        appStore.dispatch(
                            QrScannerAction.QrScannerInputAvailable(
                                normalizedUrl,
                            ),
                        )
                        dialog.dismiss()
                    }
                    create().withCenterAlignedButtons()
                }.show()
            }
        }
        appStore.dispatch(QrScannerAction.QrScannerInputConsumed)
        Events.browserToolbarQrScanCompleted.record()
    }

    override fun onPermissionsResult(
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        if (context.isPermissionGranted(CAMERA)) {
            launchQrScan()
        } else {
            appStore.dispatch(QrScannerAction.QrScannerDismissed)
        }
    }
}
