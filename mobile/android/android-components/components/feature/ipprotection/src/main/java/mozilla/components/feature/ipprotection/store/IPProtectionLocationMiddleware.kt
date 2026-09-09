/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.Country
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.Recommended
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store

/**
 * [Middleware] responsible for persisting and restoring the selected IP protection location using
 * [IPProtectionLocationRepository].
 *
 * @param repository [IPProtectionLocationRepository] persistent storage interface.
 * @param coroutineScope [CoroutineScope] used to launch coroutines.
 */
@OptIn(ExperimentalAndroidComponentsApi::class)
class IPProtectionLocationMiddleware(
    private val repository: IPProtectionLocationRepository,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO),
) : Middleware<IPProtectionState, IPProtectionAction> {

    override fun invoke(
        store: Store<IPProtectionState, IPProtectionAction>,
        next: (IPProtectionAction) -> Unit,
        action: IPProtectionAction,
    ) {
        next(action)

        when (action) {
            is IPProtectionAction.CountryListChanged -> handleCountryListChanged(action, store)
            is IPProtectionAction.LocationChanged -> handleLocationChanged(action)
            is InternalAction.AccountManagerStateChanged -> handleAccountManagerStateChanged(action)

            is IPProtectionAction.AccountStateChanged,
            is IPProtectionAction.CheckAccount,
            is IPProtectionAction.EligibilityChanged,
            is IPProtectionAction.EngineStateChanged,
            is IPProtectionAction.LocationReset,
            is IPProtectionAction.LocationSwitchFailed,
            is IPProtectionAction.ProxyActivationShown,
            is IPProtectionAction.Toggle,
            is IPProtectionAction.ToggleFailed,
            is InternalAction.AccountReadyForEnrollment,
            is InternalAction.AwaitingAuth,
            is InternalAction.EligibilityChanged,
            is InternalAction.FinishingAuthFlow,
            is InternalAction.FinishingEnrollment,
            is InternalAction.UpdateServiceState -> {
                // no-op
            }
        }
    }

    private fun handleLocationChanged(action: IPProtectionAction.LocationChanged) = coroutineScope.launch {
        repository.setSelectedLocationCode(action.location.countryCode)
    }

    private fun handleCountryListChanged(
        action: IPProtectionAction.CountryListChanged,
        store: Store<IPProtectionState, IPProtectionAction>,
    ) = coroutineScope.launch {
        val selectedLocation =
            action.countries.find {
                it.code == repository.getSelectedLocationCode() && it.available
            }

        if (selectedLocation != null) {
            // if we have found the cached selection in the update list, we should check if that's
            // the selected location, and - if it is not - update it.
            if (selectedLocation != store.state.locationState.selectedLocation) {
                store.dispatch(
                    IPProtectionAction.LocationChanged(
                        location = Country(selectedLocation.code, selectedLocation.available)
                    )
                )
            }
        } else {
            // if we couldn't find the cached selection, we should clear the cached value and
            // update the selected location to the default.
            if (store.state.locationState.selectedLocation != Recommended) {
                store.dispatch(IPProtectionAction.LocationReset)
            }

            repository.setSelectedLocationCode(null)
        }
    }

    private fun handleAccountManagerStateChanged(action: InternalAction.AccountManagerStateChanged) =
        coroutineScope.launch {
            if (action.status == AccountStatus.NoAccount) {
                repository.setSelectedLocationCode(null)
            }
        }
}
