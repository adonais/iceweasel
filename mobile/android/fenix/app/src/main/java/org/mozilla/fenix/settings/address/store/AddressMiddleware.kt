/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address.store

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Dispatchers.IO
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import org.mozilla.fenix.GleanMetrics.Addresses

/**
 * Middleware that handles [AddressStore] side-effects.
 *
 * @param environment used to hold the dependencies.
 * @param scope a [CoroutineScope] used to launch coroutines.
 * @param ioDispatcher the dispatcher to run background code on.
 */
class AddressMiddleware(
    private var environment: AddressEnvironment? = null,
    private val scope: CoroutineScope = MainScope(),
    private val ioDispatcher: CoroutineDispatcher = IO,
) : Middleware<AddressState, AddressAction> {
    override fun invoke(
        context: MiddlewareContext<AddressState, AddressAction>,
        next: (AddressAction) -> Unit,
        action: AddressAction,
    ) {
        next(action)
        when (action) {
            is EnvironmentRehydrated -> environment = action.environment
            is SaveTapped -> runAndNavigateBack {
                context.state.guidToUpdate?.let {
                    environment?.updateAddress(it, context.state.address)
                    Addresses.updated.add()
                } ?: run {
                    environment?.createAddress(context.state.address)
                    Addresses.saved.add()
                }
            }
            is DeleteDialogAction.DeleteTapped -> runAndNavigateBack {
                context.state.guidToUpdate?.also {
                    environment?.deleteAddress(it)
                    Addresses.deleted.add()
                }
            }
            BackTapped, CancelTapped -> environment?.navigateBack()
            else -> {} // noop
        }
    }

    private fun runAndNavigateBack(action: suspend () -> Unit) = scope.launch(ioDispatcher) {
        action()

        scope.launch(Dispatchers.Main) {
            environment?.navigateBack()
        }
    }
}
