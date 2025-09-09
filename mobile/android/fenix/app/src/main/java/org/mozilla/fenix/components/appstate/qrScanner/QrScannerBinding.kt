/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.qrScanner

import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import mozilla.components.lib.state.helpers.AbstractBinding
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.settings

/**
 * Binding class for the QR Scanner feature to the [AppStore].
 *
 * @property appStore [AppStore] to read state dispatches from.
 * @param qrScannerDelegate [QrScannerDelegate] for managing behavior of the QR Scanner.
 */
class QrScannerBinding(
    val appStore: AppStore,
    private val qrScannerDelegate: QrScannerDelegate,
) : AbstractBinding<AppState>(appStore) {
    override suspend fun onState(flow: Flow<AppState>) {
        flow.distinctUntilChangedBy { state -> state.qrScannerState.isRequesting }
            .collect {
                if (it.qrScannerState.isRequesting) {
                    appStore.dispatch(AppAction.QrScannerAction.QrScannerRequestConsumed)
                    qrScannerDelegate.launchQrScanner()
                }
            }
    }

    /**
     * Static functionality for the [QrScannerBinding].
     */
    companion object {
        /**
         * Convenience method for registering this binding to the given [Fragment].
         *
         * Upon destruction of the fragment's view, the binding will be unregistered
         * and all references cleared.
         */
        fun register(fragment: Fragment) {
            var qrScannerBinding: ViewBoundFeatureWrapper<QrScannerBinding>? = ViewBoundFeatureWrapper()
            qrScannerBinding?.set(
                feature = QrScannerBinding(
                    appStore = fragment.requireContext().components.appStore,
                    qrScannerDelegate = QrScannerDelegate(
                        activity = fragment.requireActivity() as AppCompatActivity,
                        browserStore = fragment.requireContext().components.core.store,
                        appStore = fragment.requireContext().components.appStore,
                        settings = fragment.requireContext().settings(),
                    ),
                ),
                owner = fragment.viewLifecycleOwner,
                view = fragment.requireView(),
            )

            fragment.viewLifecycleOwner.lifecycle.addObserver(
                object : DefaultLifecycleObserver {
                    override fun onDestroy(owner: LifecycleOwner) {
                        qrScannerBinding = null
                    }
                },
            )
        }
    }
}
