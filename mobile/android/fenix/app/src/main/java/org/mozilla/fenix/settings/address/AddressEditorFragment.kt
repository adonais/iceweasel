/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address

import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import org.mozilla.fenix.SecureFragment
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.ext.hideToolbar
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.settings.address.store.AddressEnvironment
import org.mozilla.fenix.settings.address.store.AddressMiddleware
import org.mozilla.fenix.settings.address.store.AddressState
import org.mozilla.fenix.settings.address.store.AddressStore
import org.mozilla.fenix.settings.address.store.EnvironmentRehydrated
import org.mozilla.fenix.settings.address.ui.edit.EditAddressScreen
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Displays an address editor for adding and editing an address.
 */
class AddressEditorFragment : SecureFragment() {
    private val args by navArgs<AddressEditorFragmentArgs>()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        val store = StoreProvider.get(this) {
            AddressStore(
                initialState = AddressState.initial(
                    region = requireComponents.core.store.state.search.region,
                    address = args.address,
                ),
                middleware = listOf(AddressMiddleware()),
            )
        }.also {
            val storage = requireComponents.core.autofillStorage
            val environment = AddressEnvironment(
                navigateBack = { findNavController().popBackStack() },
                createAddress = { fields -> storage.addAddress(fields).guid },
                updateAddress = { guid, fields -> storage.updateAddress(guid, fields) },
                deleteAddress = { guid -> storage.deleteAddress(guid) },
            )
            it.dispatch(EnvironmentRehydrated(environment))
        }
        FirefoxTheme {
            EditAddressScreen(store)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideToolbar()
    }
}
